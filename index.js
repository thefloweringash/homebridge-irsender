const withEncoding = (encoding, buffer) => {
    const encoding_buffer = Buffer.alloc(4);
    encoding_buffer.writeInt32LE(encoding);
    return Buffer.concat([
        encoding_buffer,
        buffer,
    ]);
}

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
    raw:             240,
    panasonic_bytes: 241,
};

const base64data = (encoding) => (data) =>
    withEncoding(encoding, Buffer.from(data, 'base64'));

const ENCODERS = {
    panasonic_intervals(data) {
        const frequency = 35;
        const rawData = Buffer.from(data, 'base64');

        const mark =  (x) => (x & -1)
        const space = (x) => (x |  1);

        const HDR_MARK   = mark(3502);
        const HDR_SPACE  = space(1700);
        const BIT_MARK   = mark(502);
        const ONE_SPACE  = space(1244);
        const ZERO_SPACE = space(400);

        const payload = [ENCODING.raw, frequency, HDR_MARK, HDR_SPACE];
        for (let byte of rawData.values()) {
            for (let bit = 0; bit < 8; bit++) {
                payload.push(BIT_MARK, byte & (1 << bit) ? ONE_SPACE : ZERO_SPACE);
            }
        }
        payload.push(BIT_MARK);

        console.log(`sending: ${JSON.stringify(payload)}`);

        return toBuffer(payload);
    },
};

for (const encoding_name of Object.keys(ENCODING)) {
    ENCODERS[encoding_name] = base64data(ENCODING[encoding_name]);
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

            this.encode = ENCODERS[this.config.encoding];
            if (!this.encode) {
                throw new Error(`Unknown encoding: ${this.config.encoding}`);
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

    homebridge.registerAccessory('homebridge-ir', 'ir-radioswitch', RadioSwitch);
    homebridge.registerAccessory('homebridge-ir', 'ir-momentaryswitch', MomentarySwitch);
};
