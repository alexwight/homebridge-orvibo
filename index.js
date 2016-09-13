var Service, Characteristic;
var Orvibo = require("node-orvibo");

module.exports = function(homebridge){
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-orvibo", "Orvibo", OrviboAccessory);
}

function OrviboAccessory(log, config) {
    this.log = log;
    this.name = config["name"];
    this.service = config["service"] || "Switch";
    this.orbivoName = config["orvibo_name"] || this.name; 
    this.macAddress = config["macAddress"];
    this.ip = config["ip"];
    this.device = { 
        macAddress: this.macAddress,
        macPadding: '202020202020',
        type: "Socket",
        ip: this.ip,
        state: false,
        name: this.orbivoName + " " + this.macAddress,
        subscribed: false
    }; 
    this.orvibo = null;
    this.subscribeRefresh = null; // This timer is used to subscribe to a device
    this.queryTimer = null; // This timer is used to query a device
    this.callback = null;
    this.log("Subscribing to Orvibo device '" + this.orbivoName + "'...");
    this.subscribe();
}

OrviboAccessory.prototype.subscribe = function() {

    this.orvibo = new Orvibo();

    this.orvibo.addDevice(this.device);

    var that = this;

    setTimeout(function() { // Set up a new timer for subscribing to this device. Repeat until we get confirmation of subscription
        that.log("Subscribing to Orvibo device");
        that.orvibo.subscribe(that.device);
    }, 1000)

    //this.orvibo.subscribe(this.device)
    
    this.subscribeRefresh = setInterval(function() { // Set up a new timer for subscribing to this device. Repeat until we get confirmation of subscription
        that.log("Re-subscribing to Orvibo device");
        that.orvibo.subscribe(that.device);
    }, 120000);

    this.orvibo.on("subscribed", function(device) {
        that.device.subscribed = true;
        that.queryTimer = setTimeout(function() { // Set up another timer, this time for querying
            that.orvibo.query({
                device: device, // Query the device we just subscribed to
                table: "04" // See PROTOCOL.md for info. "04" = Device info, "03" = Timing info
            })
        }, 1000);
    });

    // Our device has responded to our query request
    this.orvibo.on("queried", function(device, table) {
          clearInterval(that.queryTimer) // Stop the query timer
          that.log("Queried Orvibo device");
          console.log(device);
          that.device.state = device.state;
          if(that.callback) {
            that.callback(null, device.state);
            that.callback = null;
        }
    })

    this.orvibo.on("externalstatechanged", function(device) {
        that.log("State change success");
        //that.device.state = device.state;
        if(that.callback) {
            that.callback();
            that.callback = null;
        } else {
            that._service.getCharacteristic(Characteristic.On).setValue(device.state);
        }
    });

    this.orvibo.listen();
}

OrviboAccessory.prototype.getPowerOn = function(callback) {

    if (!this.device.subscribed) {
        this.log("No '%s' device found (yet?)", this.orbivoName);
        callback(new Error("Device not found"), false);
        return;
    }

    this.log("Getting power state on the '%s'...", this.orbivoName);

    this.callback = callback;
    var that = this;
    this.queryTimer = setTimeout(function() { // Set up another timer, this time for querying
        that.orvibo.query({
            device: that.device, // Query the device we just subscribed to
            table: "04" // See PROTOCOL.md for info. "04" = Device info, "03" = Timing info
        })
    }, 1000);

    //callback(null, this.device.state);
}

OrviboAccessory.prototype.setPowerOn = function(powerOn, callback) {

    if (!this.device.subscribed) {
        this.log("No '%s' device found (yet?)", this.orbivoName);
        callback(new Error("Device not found"), false);
        return;
    }

    powerOn = powerOn ? true : false;

    this.log("Setting state to " + powerOn);

    this.callback = callback;

    this.orvibo.setState({
        device: this.device,
        state: powerOn // The inverse of the current state,

    });
}

OrviboAccessory.prototype.getServices = function() {
  
  if (this.service == "Switch") {
    this._service = new Service.Switch(this.name);
    
    this._service
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerOn.bind(this))
      .on('set', this.setPowerOn.bind(this));
    
    return [this._service];
  }
  else if (this.service == "Light") {
    this._service = new Service.Lightbulb(this.name);
    
    this._service
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerOn.bind(this))
      .on('set', this.setPowerOn.bind(this));
    
    return [this._service];
  }
  else {
    throw new Error("Unknown service type '%s'", this.service);
  }
}