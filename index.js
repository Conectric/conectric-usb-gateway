const usb = require('usb')
const serialport = require('serialport');
const Readline = serialport.parsers.Readline;
const Joi = require('joi');
const cache = require('memory-cache-ttl');
const moment = require('moment');
const roundTo = require('round-to');

const conectricUsbGateway = {
    macAddress: undefined,
    parser: undefined,
    serialPort: undefined,

    MESSAGE_TYPES: {
        '30': 'tempHumidity',
        '31': 'switch',
        '32': 'motion',
        '60': 'boot',
        '61': 'text'
    },

    PARAM_SCHEMA: Joi.object().keys({
        onSensorMessage: Joi.func().required(),
        sendRawData: Joi.boolean().optional(),
        sendBootMessages: Joi.boolean().optional(),
        sendDecodedPayload: Joi.boolean().optional(),
        useFahrenheitTemps: Joi.boolean().optional(),
        switchOpenValue: Joi.boolean().optional(),
        deDuplicateBursts: Joi.boolean().optional(),
        debugMode: Joi.boolean().optional()
    }).required().options({
        allowUnknown: false
    }),

    IGNORABLE_MESSAGE_TYPES: [ '33', '34', '35' ],

    KNOWN_COMMANDS: [ 'DB', 'MR' ],

    runGateway: async function(params) {
        const validationResult = Joi.validate(params, conectricUsbGateway.PARAM_SCHEMA);

        if (validationResult.error) {
            console.error(validationResult.details);
            return;
        }

        // sendBootMessages is on by default
        if (! params.hasOwnProperty('sendBootMessages')) {
            params.sendBootMessages = true;
        }

        // sendDecodedPayload is on by default
        if (! params.hasOwnProperty('sendDecodedPayload')) {
            params.sendDecodedPayload = true;
        }

        // deDuplicateBursts is on by default
        if (! params.hasOwnProperty('deDuplicateBursts')) {
            params.deDuplicateBursts = true;
        }

        // Establish cache if needed.
        if (params.deDuplicateBursts) {
            cache.init({ ttl: 30, interval: 3, randomize: false });
        }

        conectricUsbGateway.params = params;

        conectricUsbGateway.handleUSBEvents();
        conectricUsbGateway.startGateway();
    },

    handleUSBEvents: () => {
        usb.on('attach', function(device) { 
            if (conectricUsbGateway.isConectricRouter(device)) {
                console.log('USB Router device attached.');
                setTimeout(conectricUsbGateway.startGateway, 200); 
            }
        });
        usb.on('detach', function(device) { 
            if (conectricUsbGateway.isConectricRouter(device)) {
                console.log('USB Router device removed.');
                setTimeout(conectricUsbGateway.startGateway, 100); 
            }
        });        
    },

    startGateway: async function () {
        try {
            await conectricUsbGateway.findRouterDevice();
            console.log(`Found USB router device at ${conectricUsbGateway.comName}.`);
        } catch(e) {
            console.log('Waiting for USB router device.');
            conectricUsbGateway.macAddress = undefined;
            conectricUsbGateway.parser = undefined;
            conectricUsbGateway.serialPort = undefined;
            return;
        }

        conectricUsbGateway.startSerial();
        conectricUsbGateway.parser = new Readline();
        conectricUsbGateway.serialPort.pipe(conectricUsbGateway.parser);

        conectricUsbGateway.serialPort.on('open', function() {
            console.log('Gateway opened.');
        });

        conectricUsbGateway.serialPort.on('close', function() {
            console.log('Gateway closed.');
        });

        conectricUsbGateway.parser.on('data', function(data) {
            if (data.startsWith('>')) {
                // Found a message.
                conectricUsbGateway.parseMessage(`${data.substring(1)}`);
            } else if (data.startsWith('MR:')) {
                // Found mac address.
                conectricUsbGateway.macAddress = `${data.substring(3)}`;
                console.log(`USB router mac address is ${conectricUsbGateway.macAddress}.`);
            } else if (data === 'DP:Ok') {
                // Dump buffer was acknowledged OK.
                console.log('Switched gateway to dump payload mode.');
            } else {
                if (! conectricUsbGateway.KNOWN_COMMANDS.includes(data)) {
                    if (conectricUsbGateway.params.debugMode) {
                        console.log(`Unprocessed: ${data}`);
                    }
                }
            }
        });
        
        setTimeout(function() {
            conectricUsbGateway.serialPort.write('DP\nMR\n');
        }, 1500);
    },

    isConectricRouter: (device) => {
        const descriptor = device.deviceDescriptor;
        if (descriptor) {
            return (descriptor.idVendor && descriptor.idVendor === 1027 && descriptor.idProduct && descriptor.idProduct === 24597);
        }

        return false;
    },

    findRouterDevice: () => {
        return new Promise((resolve, reject) => {
            serialport.list((err, ports) => {
                for (let n = 0; n < ports.length; n++) {
                    const port = ports[n];

                    if (port.manufacturer && port.manufacturer === 'FTDI' && port.comName.indexOf('usbserial-') !== -1) {
                        conectricUsbGateway.comName = port.comName;
                        return resolve(port.comName);
                    }
                }

                // No suitable port found.
                conectricUsbGateway.comName = null;
                return reject();
            });
        });
    },

    startSerial: () => {
        conectricUsbGateway.serialPort = new serialport(conectricUsbGateway.comName, {
            baudRate: 9600
        });

        return conectricUsbGateway.serialPort;
    },

    parseMessage: (data) => {
        if (conectricUsbGateway.params.debugMode) {
            console.log(data);
        }

        // Get to the message type value first so we can drop message
        // types that are not intended for the end user.
        const headerLength = parseInt(data.substring(0, 2), 16);
        const messageType = data.substring(2 + (headerLength * 2), 4 + (headerLength * 2));

        if (conectricUsbGateway.IGNORABLE_MESSAGE_TYPES.includes(messageType)) {
            // Drop this message and do no more work on it.
            if (conectricUsbGateway.params.debugMode) {
                console.log(`Dropping message "${data}" as it is ignorable.`);
            }
            
            return;
        }

        const messageTypeString = conectricUsbGateway.MESSAGE_TYPES[messageType];

        if (! messageTypeString || messageTypeString.length === 0) {
            if (conectricUsbGateway.params.debugMode) {
                console.log(`Ignoring unknown message type "${messageType}".`);
            }

            return;
        }

        const destAddr = data.substring(8, 12);
        const sourceAddr = data.substring(8, 12);
        const sequenceNumber = parseInt(data.substring(2, 4), 16);

        // Check if we have cached this message before
        if (conectricUsbGateway.params.deDuplicateBursts) {
            const cacheKey = `${destAddr}${sourceAddr}${sequenceNumber}`;

            if (! cache.get(cacheKey)) {
                // We have not dealt with this burst before.
                cache.set(cacheKey, true);
            } else {
                // We have seen this recently and processed it so drop it.
                if (conectricUsbGateway.params.debugMode) {
                    console.log(`Dropping message "${data}", already processed message from this burst.`);
                }

                return;
            }
        }

        const payloadLength = parseInt(data.substring(0 + (headerLength * 2), 2 + (headerLength * 2)), 16);
        const battery = parseInt(data.substring(4 + (headerLength * 2), 6 + (headerLength * 2)), 16) / 10;
        const messageData = data.substring(4 + (headerLength * 2));
        
        const message = {
            type: messageTypeString,
            payload: {},
            timestamp: moment().unix(),
            sensorId: sourceAddr,
            sequenceNumber: sequenceNumber
        };

        if (conectricUsbGateway.params.sendRawData) {
            message.rawData = data;
        }

        if (! conectricUsbGateway.params.sendDecodedPayload) {
            delete(message.payload);
        } else {
            switch (messageTypeString) {
                case 'tempHumidity':
                    if (messageData.length !== 8) {
                        if (conectricUsbGateway.params.debugMode) {
                            console.error(`Ignoring tempHumidity message with payload length ${messageData.length}, was expecting length 8.`);
                        }

                        return;
                    }

                    const tempRaw = messageData.substring(0, 4);
                    const humidityRaw = messageData.substring(4);

                    message.payload.battery = battery;
                    message.payload.temperature = roundTo((-46.85 + ((parseInt(tempRaw, 16) / 65536) * 175.72)), 2); // celcius

                    if (conectricUsbGateway.params.useFahrenheitTemps) {
                        message.payload.temperature = roundTo(((message.payload.temperature * (9 / 5)) + 32), 2); // fahrenheit
                        message.payload.temperatureUnit = 'F';
                    } else {
                        message.payload.temperatureUnit = 'C';
                    }

                    message.payload.humidity = roundTo((-6 + (125 * (parseInt(humidityRaw, 16) / 65536))), 2); // percentage
                    break;
                case 'motion':
                    message.payload.battery = battery;
                    message.payload.motion = true;
                    break;
                case 'switch':
                    message.payload.battery = battery;
                    message.payload.switch = (conectricUsbGateway.params.switchOpenValue ? (messageData === '71') : (messageData === '72'));
                    break;
                case 'boot': 
                    if (conectricUsbGateway.params.sendBootMessages) {
                        message.payload.battery = battery;
                        
                        switch (messageData) {
                            case '00':
                                message.payload.resetCause = 'powerOn';
                                break;
                            case '01':
                                message.payload.resetCause = 'externalReset';
                                break;
                            case '02':
                                message.payload.resetCause = 'watchdogReset';
                                break;
                            default:
                                // Unknown
                                message.payload.resetCause = 'unknown';

                                if (conectricUsbGateway.params.debugMode) {
                                    console.error(`Boot message received with unknown reset cause "${messageData}", full message was "${data}".`)
                                }
                        }
                    } else {
                        // Not sending boot message to callback.
                        return;
                    }
                case 'text':
                    message.payload.text = messageData;
                    break;
                default:
                    if (conectricUsbGateway.params.debugMode) {
                        console.log(`Ignoring unknown message type "${messageType}"`);
                    }
            }
        }

        conectricUsbGateway.params.onSensorMessage(message);
    }
}

module.exports = conectricUsbGateway;