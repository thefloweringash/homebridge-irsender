const AirconMitsubishiGP82Coding = require('./aircon_mitsubishi_gp82');
const AirconDakinCoding = require('./aircon_daikin');

const withEncoding = (encoding, buffer) => {
    const encoding_buffer = Buffer.from([encoding]);
    return Buffer.concat([
        encoding_buffer,
        buffer,
    ]);
}

const bundleCommands = (...commands) => {
    const bufs = [
        Buffer.from([commands.length]),
    ];

    for (const cmd of commands) {
        bufs.push(Buffer.from([cmd.length]), cmd);
    }
    return Buffer.concat(bufs);
};

const toBuffer = (longs) => {
    const buffer = Buffer.alloc(longs.length * 4);
    for (let i = 0; i < longs.length; i++) {
        buffer.writeInt32LE(longs[i], i * 4);
    }
    return buffer;
};


const ENCODING = {
    // from IRremote
    nec:        1,
    sony:       2,
    rc5:        3,
    rc6:        4,
    dish:       5,
    sharp:      6,
    panasonic:  7,
    jvc:        8,
    sanyo:      9,
    mitsubishi: 10,
    samsung:    11,
    lg:         12,
    whynter:    13,
    coolix:     15,
    daikin:     16,
    denon:      17,
    unknown:    -1,

    // From my additional sender extensions
    delay:           239,
    raw:             240,
    panasonic_bytes: 241,
};

const delayCommand = (length) => {
    const buffer = Buffer.alloc(3);
    buffer[0] = ENCODING.delay;
    buffer.writeInt16LE(length, 1);
    return buffer;
};

const SINGLE_PACKET_ENCODERS = {};

for (const encoding_name of Object.keys(ENCODING)) {
    SINGLE_PACKET_ENCODERS[encoding_name] = (data) =>
        bundleCommands(withEncoding(ENCODING[encoding_name], Buffer.from(data, 'base64')));
}

module.exports = (homebridge) => {
    const mqtt = require('mqtt');

    const { Service, Characteristic } = homebridge.hap;

    const internal = Symbol('internal');
    const ircode   = Symbol('ircode');

    class MQTTIRAccessory {
        constructor(log, config) {
            this.log = log;
            this.config = this.parseConfig(config);

            const mqtt_config = this.parseMQTTConfig(this.config.mqtt);
            this.mqtt_client = mqtt.connect(mqtt_config);
            this.mqtt_client.on('error', this.onMQTTError.bind(this));

            if (this.config.encoding) {
                this.encode = SINGLE_PACKET_ENCODERS[this.config.encoding];
                if (!this.encode) {
                    throw new Error(`Unknown encoding: ${this.config.encoding}`);
                }
            }
        }

        parseConfig(config) {
            return config;
        }

        parseMQTTConfig(config) {
            const {
                clientId = this.randomClientID(),
                keepalive = 10,
                protocolId = 'MQTT',
                protocolVersion = 4,
                clean = true,
                reconnectPeriod = 1000,
                username = undefined,
                password = undefined
            } = config;

            return {
                clientId, keepalive, protocolId, protocolVersion, clean,
                reconnectPeriod, username, password
            };
        }

        onMQTTError() {
            this.log('mqtt error');
        }

        sendIR(data) {
            this.log(`sendIR: ${data}`);
            const buffer = this.encode(data);
            this.mqtt_client.publish(this.config.sendTopic, buffer);
        }
    }

    class RadioSwitch extends MQTTIRAccessory {
        constructor(log, config) {
            super(log, config);
            this.switches =
              this.config.switches.map(({name, subtype, code}) => {
                  const sw = this.newSwitch(name, subtype);
                  sw[ircode] = code;
                  return sw;
              });
            this.log(`Registered ${this.switches.length} switches`);
        }

        newSwitch(name, subtype) {
            const sw = new Service.Switch(this.config.name);

            sw.subtype = subtype;

            sw.getCharacteristic(Characteristic.Name)
                 .setValue(name);

            sw.getCharacteristic(Characteristic.On)
                 .on('get', this.getStatus.bind(this, sw))
                 .on('set', this.setStatus.bind(this, sw));

            return sw;
        }

        getStatus(sw, callback) {
            callback(null, sw === this.activeSwitch);
        }

        setStatus(sw, status, callback, context) {
            if (context !== internal) {
                this.log(`setStatus sending ${sw[ircode]}`);
                this.activeSwitch = status ? sw : null;
                this.sendIR(status ? sw[ircode] : this.config.off);
            }

            // Mutually exclusive switches, turn the others off
            if (status) {
                for (const s of this.switches) {
                    if (s !== sw) {
                        s.getCharacteristic(Characteristic.On)
                         .setValue(false, undefined, internal);
                    }
                }
            }

            callback();
        }

        getServices() {
            return [...this.switches];
        }
    }

    class MomentarySwitch extends MQTTIRAccessory {
        constructor(log, config) {
            super(log, config)

            this.switch = new Service.Switch(this.config.name);

            this.switch.getCharacteristic(Characteristic.Name)
                .setValue('TV');

            this.switch.getCharacteristic(Characteristic.On)
                .on('get', this.getStatus.bind(this))
                .on('set', this.setStatus.bind(this));

            this.resetSwitch = this.resetSwitch.bind(this);
        }

        getStatus(callback) {
            callback(null, false);
        }

        setStatus(status, callback, context) {
            const send = context !== internal;
            if (send) {
                this.sendIR(this.config.action);
            }
            callback();
            if (send) {
                setTimeout(this.resetSwitch, 1000);
            }
        }

        resetSwitch() {
                this.switch.getCharacteristic(Characteristic.On)
                    .setValue(false, undefined, internal);
        }

        getServices() {
            return [this.switch];
        }
    }

    class Aircon extends MQTTIRAccessory {
        constructor(log, config) {
            super(log, config);

            this.heatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
            this.targetTemperature   = 18;

            this.thermostat = new Service.Thermostat(this.config.name);

            this.thermostat.getCharacteristic(Characteristic.Name)
                .setValue('Aircon');

            this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                .on('get', this.getCurrentHeatingCoolingState.bind(this));

            this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                .setValue(this.heatingCoolingState)
                .on('set', this.setTargetHeatingCoolingState.bind(this));

            this.thermostat.getCharacteristic(Characteristic.CurrentTemperature)
                .on('get', this.getCurrentTemperature.bind(this));

            this.thermostat.getCharacteristic(Characteristic.TargetTemperature)
                .setValue(this.targetTemperature)
                .on('set', this.setTargetTemperature.bind(this));

            this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits)
                .setValue(Characteristic.TemperatureDisplayUnits.CELSIUS);
        }

        // We're a pushing module only, lie about the current and
        // claim they're the same as the target
        getCurrentHeatingCoolingState(callback) {
            callback(null, this.heatingCoolingState);
        }

        getCurrentTemperature(callback) {
            callback(null, this.targetTemperature);
        }

        // Basic AC model
        setOn(value, callback) {
            this.on = value;
            this.pushState();
            callback();
        }

        setTargetTemperature(value, callback) {
            this.targetTemperature = value;
            this.pushState();
            callback();

            this.thermostat.getCharacteristic(Characteristic.CurrentTemperature)
                .setValue(this.targetTemperature, null);
        }

        setTargetHeatingCoolingState(value, callback) {
            this.heatingCoolingState = value;
            this.pushState();
            callback();

            this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                .setValue(this.heatingCoolingState, null);
        }

        getServices() {
            return [this.thermostat];
        }
    }

    class AirconMitsubishiGP82 extends Aircon {
        constructor(log, config) {
            super(log, config);

            this.thermostat.getCharacteristic(Characteristic.TargetTemperature)
                .setProps({ minValue: 16, maxValue: 31 });

            this.encodeTargetHeatingCoolingState = {
                [Characteristic.TargetHeatingCoolingState.HEAT]: AirconMitsubishiGP82Coding.MODE.heating,
                [Characteristic.TargetHeatingCoolingState.COOL]: AirconMitsubishiGP82Coding.MODE.cooling,
            };
        }

        setTargetHeatingCoolingState(value, callback) {
            const validHeatingCoolingState =
                (value === Characteristic.TargetHeatingCoolingState.OFF) ||
                this.encodeTargetHeatingCoolingState[value];

            if (validHeatingCoolingState) {
                super.setTargetHeatingCoolingState(value, callback);
            }
            else {
                callback('Not supported'); // TODO: this doesn't seem to signal error
            }
        }

        pushState() {
            const on = this.heatingCoolingState !== Characteristic.TargetHeatingCoolingState.OFF;
            let aircon_params;
            if (on) {
                aircon_params = {
                    on:          1,
                    mode:        this.encodeTargetHeatingCoolingState[this.heatingCoolingState],
                    temperature: this.targetTemperature,
                };
            }
            else {
                aircon_params = { on: 0 };
            }

            this.log(`Sending: ${JSON.stringify(aircon_params)}`);
            const aircon_packet = AirconMitsubishiGP82Coding.encode(aircon_params);
            const ir_packet = SINGLE_PACKET_ENCODERS.panasonic_bytes(aircon_packet);
            this.mqtt_client.publish(this.config.sendTopic, ir_packet);
        }
    }

    class AirconDaikin extends Aircon {
        constructor(log, config) {
            super(log, config);

            this.thermostat.getCharacteristic(Characteristic.TargetTemperature)
                .setProps({ minValue: 16, maxValue: 31 });

            this.encodeTargetHeatingCoolingState = {
                [Characteristic.TargetHeatingCoolingState.HEAT]: AirconMitsubishiGP82Coding.MODE.heating,
                [Characteristic.TargetHeatingCoolingState.COOL]: AirconMitsubishiGP82Coding.MODE.cooling,
            };
        }

        setTargetHeatingCoolingState(value, callback) {
            const validHeatingCoolingState =
                (value === Characteristic.TargetHeatingCoolingState.OFF) ||
                this.encodeTargetHeatingCoolingState[value];

            if (validHeatingCoolingState) {
                super.setTargetHeatingCoolingState(value, callback);
            }
            else {
                callback('Not supported'); // TODO: this doesn't seem to signal error
            }
        }

        pushState() {
            const on = this.heatingCoolingState !== Characteristic.TargetHeatingCoolingState.OFF;
            let aircon_params;
            if (on) {
                aircon_params = {
                    power:       1,
                    mode:        this.encodeTargetHeatingCoolingState[this.heatingCoolingState],
                    temperature: this.targetTemperature,
                };
            }
            else {
                aircon_params = { power: 0 };
            }

            this.log(`Sending: ${JSON.stringify(aircon_params)}`);
            const aircon_packets = AirconDiakinCoding.encode(aircon_params);
            const ir_packet = bundleCommands(
                // withEncoding(ENCODING.panasonicBytes, Buffer.from([0])),
                withEncoding(ENCODING.panasonicBytes, aircon_packets[0]),
                delayCommand(35),
                withEncoding(ENCODING.panasonicBytes, aircon_packets[1])
                );
            this.mqtt_client.publish(this.config.sendTopic, ir_packet);
        }
    }

    homebridge.registerAccessory('homebridge-ir', 'ir-radioswitch', RadioSwitch);
    homebridge.registerAccessory('homebridge-ir', 'ir-momentaryswitch', MomentarySwitch);
    homebridge.registerAccessory('homebridge-ir', 'ir-aircon-mitsubishi-gp82', AirconMitsubishiGP82);
    homebridge.registerAccessory('homebridge-ir', 'ir-aircon-diakin', AirconDaikin);
};
