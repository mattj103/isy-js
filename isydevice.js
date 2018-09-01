var isy = require('./isy.js');
var util = require('util');
var assert = require('assert');


 const  ISY_PROPERTY_STATE = 'ST';
 const  ISY_PROPERTY_COOL_SETPOINT = 'CLISPC';
 const  ISY_PROPERTY_HEAT_SETPOINT = 'CLISPH';
 const  ISY_PROPERTY_MODE = 'CLIMD';
 const  ISY_PROPERTY_HUMIDITY = 'CLIHUM';
 const  ISY_PROPERTY_HEATING_COOLING_STATE = 'CLIHCS';
 const  ISY_PROPERTY_FAN_STATE = 'CLIFS';

class ISYBaseDevice {
    constructor(isy, productName, deviceType, deviceFamily, deviceNode, propertyChangeCallback) {
        this.isy = isy;
        this.name = deviceNode.name;
        this.address = deviceNode.address;
        this.productName = productName;
        this.isyType = deviceNode.type;
        this.deviceType = deviceType;
        this.batteryOperated = deviceType == 'MotionSensor';
        this.connectionType = deviceFamily;
        this.deviceFriendlyName = deviceType;
        this.currentState = 0;
        this.lastChanged = new Date();
        this.DIM_LEVEL_MINIMUM = 0;
        this.DIM_LEVEL_MAXIMUM = 100;
        this.ISY_DIM_LEVEL_MAXIMUM = 255;
        this.ISY_COMMAND_LIGHT_ON = "DON";
        this.ISY_COMMAND_LIGHT_OFF = "DOF";
        this.ISY_COMMAND_LOCK_LOCK = "DON";
        this.ISY_COMMAND_LOCK_UNLOCK = "DOF";
        this.ISY_COMMAND_SECURE_LOCK_BASE = 'SECMD';
        this.ISY_COMMAND_SECURE_LOCK_PARAMETER_LOCK = '1';
        this.ISY_COMMAND_SECURE_LOCK_PARAMETER_UNLOCK = '0';
        this.ISY_STATE_LOCK_UNLOCKED = 0;
        this.ISY_STATE_DOOR_WINDOW_CLOSED = 0;
        this.ISY_STATE_LEAK_SENSOR_DRY = 0;
        this.ISY_STATE_MOTION_SENSOR_ON = 255;
        this.ISY_COMMAND_OUTLET_ON = 'DON';
        this.ISY_COMMAND_OUTLET_OFF = 'DOF';
        this.FAN_OFF = 'Off';
        this.FAN_LEVEL_LOW = 'Low';
        this.FAN_LEVEL_MEDIUM = 'Medium';
        this.FAN_LEVEL_HIGH = 'High';
        this.ISY_COMMAND_FAN_BASE = 'DON';
        this.ISY_COMMAND_FAN_OFF = 'DOF';
        this.ISY_COMMAND_FAN_PARAMETER_LOW = 63;
        this.ISY_COMMAND_FAN_PARAMETER_MEDIUM = 191;
        this.ISY_COMMAND_FAN_PARAMETER_HIGH = 255;
        this.childDevices = {};
        this.deviceNode = deviceNode;
        this.propertyChangeCallback = propertyChangeCallback;
    }

    handleIsyUpdate(actionValue, propertyName, subAddress) {
        var changed = false;
        if (propertyName == ISY_PROPERTY_STATE) {
            if (actionValue != this.currentState) {
                this.currentState = Number(actionValue);
                this.lastChanged = new Date();
                changed = true;
            }
        }
        if(this.propertyChangeCallback !== null && this.propertyChangeCallback !== undefined && changed)
            this.propertyChangeCallback(propertyName,actionValue);
        return changed;
    }
}

class ISYLightDevice extends ISYBaseDevice {
    constructor(isy, deviceNode, deviceTypeInfo)  {
        super(isy, deviceTypeInfo.name, deviceTypeInfo.deviceType, deviceTypeInfo.connectionType, deviceNode);
        this.isDimmable = (deviceTypeInfo.deviceType == isy.DEVICE_TYPE_DIMMABLE_LIGHT);
    }
    getCurrentLightState() {
        return (this.currentState > 0);
    }
    getCurrentLightDimState() {
        return Math.floor((this.currentState * this.DIM_LEVEL_MAXIMUM) / this.ISY_DIM_LEVEL_MAXIMUM);
    }
    sendLightCommand(lightState, resultHandler) {
        this.isy.sendRestCommand(this.address, (lightState) ? this.ISY_COMMAND_LIGHT_ON : this.ISY_COMMAND_LIGHT_OFF, null, resultHandler);
    }
    sendLightDimCommand(dimLevel, resultHandler) {
        var isyDimLevel = Math.ceil(dimLevel * this.ISY_DIM_LEVEL_MAXIMUM / this.DIM_LEVEL_MAXIMUM);
        this.isy.sendRestCommand(this.address, this.ISY_COMMAND_LIGHT_ON, isyDimLevel, resultHandler);
    }
}



class ISYLockDevice extends ISYBaseDevice {
    constructor(isy, deviceNode, deviceTypeInfo) {
        super(isy, deviceTypeInfo.name, deviceTypeInfo.deviceType, deviceTypeInfo.connectionType, deviceNode);
    }
    sendLockCommand(lockState, resultHandler) {
        if (this.deviceType == this.isy.DEVICE_TYPE_LOCK) {
            this.sendNonSecureLockCommand(lockState, resultHandler);
        } else if (this.deviceType == this.isy.DEVICE_TYPE_SECURE_LOCK) {
            this.sendSecureLockCommand(lockState, resultHandler);
        } else {
            assert(false, 'Should not ever have lock which is not one of the known lock types');
        }
    }
    getCurrentLockState() {
        if (this.deviceType == this.isy.DEVICE_TYPE_LOCK) {
            return this.getCurrentNonSecureLockState();
        } else if (this.deviceType == this.isy.DEVICE_TYPE_SECURE_LOCK) {
            return this.getCurrentSecureLockState();
        } else {
            assert(false, 'Should not ever have lock which is not one of the known lock types');
        }
    }
    getCurrentNonSecureLockState() {
        return (this.currentState != this.ISY_STATE_LOCK_UNLOCKED);
    }
    getCurrentSecureLockState() {
        return (this.currentState > 0);
    }
    sendNonSecureLockCommand(lockState, resultHandler) {
        if (lockState) {
            this.isy.sendRestCommand(this.address, this.ISY_COMMAND_LOCK_LOCK, null, resultHandler);
        } else {
            this.isy.sendRestCommand(this.address, this.ISY_COMMAND_LOCK_UNLOCK, null, resultHandler);
        }
    }
    sendSecureLockCommand(lockState, resultHandler) {
        if (lockState) {
            this.isy.sendRestCommand(this.address, this.ISY_COMMAND_SECURE_LOCK_BASE, this.ISY_COMMAND_SECURE_LOCK_PARAMETER_LOCK, resultHandler);
        } else {
            this.isy.sendRestCommand(this.address, this.ISY_COMMAND_SECURE_LOCK_BASE, this.ISY_COMMAND_SECURE_LOCK_PARAMETER_UNLOCK, resultHandler);
        }
    }
}


////////////////////////////////////////////////////////////////////////
// LEAK SENSOR
//

class ISYLeakDevice extends ISYBaseDevice {
    constructor(isy, deviceNode, deviceTypeInfo)  {
        super(isy, deviceTypeInfo.name, deviceTypeInfo.deviceType, deviceTypeInfo.connectionType,deviceNode);
    }
    getCurrentLeakState() {
        return (this.currentState != this.ISY_STATE_LEAK_SENSOR_DRY);
    }
}

////////////////////////////////////////////////////////////////////////
// ISYDoorWindowDevice
//

class ISYDoorWindowDevice extends ISYBaseDevice {
    constructor(isy, deviceNode, deviceTypeInfo)  {
        super(isy, deviceTypeInfo.name, deviceTypeInfo.deviceType, deviceTypeInfo.connectionType,deviceNode);
    }
    getCurrentDoorWindowState() {
        return (this.currentState != this.ISY_STATE_DOOR_WINDOW_CLOSED);
    }
}

////////////////////////////////////////////////////////////////////////
// ISYMotionSensorDevice
//

class ISYMotionSensorDevice extends ISYBaseDevice {
    constructor(isy, deviceNode, deviceTypeInfo)  {
        super(isy, deviceTypeInfo.name, deviceTypeInfo.deviceType, deviceTypeInfo.connectionType,deviceNode);
    }

    getCurrentMotionSensorState() {
        return (this.currentState == this.ISY_STATE_MOTION_SENSOR_ON) ? true : false;
    }
}
class ISYThermostatDevice extends ISYBaseDevice {
    constructor(isy, deviceNode, deviceTypeInfo) {
        super(isy,deviceTypeInfo.name, deviceTypeInfo.deviceType, deviceTypeInfo.connectionType, deviceNode);
        this.coolSetPoint = 0;
        this.heatSetPoint = 0;
        this.humidity = 0;
        this.mode = 3;
        this.currentMode = 0;
        this.fanState = 0;
    }

    handleIsyUpdate(actionValue, propertyName, subAddress) {
        var changed = false;
     
        if (subAddress == 2) {
            var isOn = actionValue == 255;
            if (isOn && this.currentMode != 3) {
                this.currentMode = 3;
                this.lastChanged = new Date();
                changed = true;
            }
        } else if (subAddress == 3) {
            var isOn = actionValue == 255;
            if (isOn && this.currentMode != 2) {
                this.currentMode = 2;
                this.lastChanged = new Date();
                changed = true;
            }
        } else if (subAddress == 4) {
            var isOn = actionValue == 255;
            if (isOn && this.currentMode != 1) {
                this.currentMode = 1;
                this.lastChanged = new Date();
                changed = true;
            }
        } else {
            if (propertyName == ISY_PROPERTY_STATE) {
                if (actionValue != this.currentState) {
                    this.currentState = Number(actionValue);
                    this.lastChanged = new Date();
                    changed = true;
                }
            } else if (propertyName == ISY_PROPERTY_COOL_SETPOINT) {
                if (actionValue != this.coolSetPoint) {
                    this.coolSetPoint = Number(actionValue);
                    this.lastChanged = new Date();
                    changed = true;
                }
            } else if (propertyName == ISY_PROPERTY_HEAT_SETPOINT) {
                if (actionValue != this.heatSetPoint) {
                    this.heatSetPoint = Number(actionValue);
                    this.lastChanged = new Date();
                    changed = true;
                }
            } else if (propertyName == ISY_PROPERTY_MODE) {
                if (actionValue != this.mode) {
                    this.mode = Number(actionValue);
                    this.lastChanged = new Date();
                    changed = true;
                }
            } else if (propertyName == ISY_PROPERTY_HUMIDITY) {
                if (actionValue != this.humidity) {
                    this.humidity = Number(actionValue);
                    this.lastChanged = new Date();
                    changed = true;
                }
            } else if (propertyName == ISY_PROPERTY_HEATING_COOLING_STATE) {
                if (actionValue != this.currentMode) {
                    this.currentMode = Number(actionValue);
                    this.lastChanged = new Date();
                    changed = true;
                }
            } else if (propertyName == ISY_PROPERTY_FAN_STATE) {
                if (actionValue != this.fanState) {
                    this.fanState = Number(actionValue);
                    this.lastChanged = new Date();
                    changed = true;
                }
            }
        }
        if(this.propertyChangeCallback !== null && this.propertyChangeCallback !== undefined && changed)
            this.propertyChangeCallback(propertyName,actionValue);
        return changed;
    }
    getCurrentTemperatureState() {
        return this.currentState / 2;
    }
    getCoolSetPoint() {
        return this.coolSetPoint / 2;
    }
    getHeatSetPoint() {
        return this.heatSetPoint / 2;
    }
    getHeatingCoolingMode() {
        return this.mode;
    }
    getHeatingCoolingState() {
        return this.currentMode;
    }
    getFanState() {
        return this.fanState;
    }
    getHumidity() {
        return this.humidity / 255 * 100;
    }
    sendUpdateCoolSetPointCommand(value, resultHandler) {
        
       this.isy.sendRestCommand(this.address, ISY_PROPERTY_COOL_SETPOINT, value * 2, resultHandler);
        
    }
    sendUpdateHeatSetPointCommand(value, resultHandler) {
        
        this.isy.sendRestCommand(this.address, ISY_PROPERTY_HEAT_SETPOINT, value * 2, resultHandler);
    
    }
    sendUpdateHeatingCoolingModeCommand(value, resultHandler) {
        
        this.isy.sendRestCommand(this.address, ISY_PROPERTY_MODE, value * 2, resultHandler);
    
    }
}


class ISYOutletDevice extends ISYBaseDevice {
    constructor(isy, deviceNode, deviceTypeInfo)  {
        super(isy, deviceTypeInfo.name, deviceTypeInfo.deviceType, deviceTypeInfo.connectionType,deviceNode);
    }
    getCurrentOutletState(){
        return (this.currentState > 0) ? true : false;
    }
    sendOutletCommand(outletState, resultHandler) {
        this.isy.sendRestCommand(this.address, (outletState) ? this.ISY_COMMAND_OUTLET_ON : this.ISY_COMMAND_OUTLET_OFF, null, resultHandler);
    }
}


////////////////////////////////////////////////////////////////////////
// ISYFanDevice
//

class ISYFanDevice extends ISYBaseDevice {
    constructor(isy, deviceNode, deviceTypeInfo) {
        super(isy, deviceTypeInfo.name, deviceTypeInfo.deviceType, deviceTypeInfo.connectionType,deviceNode);
    }

    getCurrentFanState() {
        if (this.currentState == 0) {
            return this.FAN_OFF;
        } else if (this.currentState == this.ISY_COMMAND_FAN_PARAMETER_LOW) {
            return this.FAN_LEVEL_LOW;
        } else if (this.currentState == this.ISY_COMMAND_FAN_PARAMETER_MEDIUM) {
            return this.FAN_LEVEL_MEDIUM;
        } else if (this.currentState == this.ISY_COMMAND_FAN_PARAMETER_HIGH) {
            return this.FAN_LEVEL_HIGH;
        } else {
            assert(false, 'Unexpected fan state: ' + this.currentState);
        }
    }

    sendFanCommand(fanState, resultHandler) {
        if (fanState == this.FAN_OFF) {
            this.isy.sendRestCommand(this.address, this.ISY_COMMAND_FAN_OFF, null, resultHandler);
        } else if (fanState == this.FAN_LEVEL_LOW) {
            this.isy.sendRestCommand(this.address, this.ISY_COMMAND_FAN_BASE, this.ISY_COMMAND_FAN_PARAMETER_LOW, resultHandler);
        } else if (fanState == this.FAN_LEVEL_MEDIUM) {
            this.isy.sendRestCommand(this.address, this.ISY_COMMAND_FAN_BASE, this.ISY_COMMAND_FAN_PARAMETER_MEDIUM, resultHandler);
        } else if (fanState == this.FAN_LEVEL_HIGH) {
            this.isy.sendRestCommand(this.address, this.ISY_COMMAND_FAN_BASE, this.ISY_COMMAND_FAN_PARAMETER_HIGH, resultHandler);
        } else {
            assert(false, 'Unexpected fan level: ' + fanState);
        }
    }
  

    /* ISYFanDevice.prototype.getCurrentFanState() = function () {
        if (this.currentState == 0) {
            return this.FAN_OFF;
        } else if (this.currentState == this.ISY_COMMAND_FAN_PARAMETER_LOW) {
            return this.FAN_LEVEL_LOW;
        } else if (this.currentState == this.ISY_COMMAND_FAN_PARAMETER_MEDIUM) {
            return this.FAN_LEVEL_MEDIUM;
        } else if (this.currentState == this.ISY_COMMAND_FAN_PARAMETER_HIGH) {
            return this.FAN_LEVEL_HIGH;
        } else {
            assert(false, 'Unexpected fan state: ' + this.currentState);
        }
    }
*/}

exports.ISYBaseDevice = ISYBaseDevice;
exports.ISYOutletDevice = ISYOutletDevice;
exports.ISYLightDevice = ISYLightDevice;
exports.ISYLockDevice = ISYLockDevice;
exports.ISYDoorWindowDevice = ISYDoorWindowDevice;
exports.ISYLeakDevice = ISYLeakDevice
exports.ISYFanDevice = ISYFanDevice;
exports.ISYMotionSensorDevice = ISYMotionSensorDevice;
exports.ISYThermostatDevice = ISYThermostatDevice;