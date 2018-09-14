/*
    EKM Omnimeter v3 demo.

    Reads data from meter serial number "000010006388" attached to Conectric RS-485 sensor "dfbc".

    One reading can be obtained by sending a single message to the meter.

    Meter response is received via data chunks.
*/

const gateway = require('conectric-usb-gateway');

const METER_SERIAL_NUMBER_HEX = '303030303130303036333838';

let ekmData = {
    dataChunks: []
};

gateway.runGateway({
    onSensorMessage: (sensorMessage) => {
        if (sensorMessage.type === 'rs485ChunkEnvelopeResponse') {
            console.log(`Need to request ${sensorMessage.payload.numChunks} chunks of size ${sensorMessage.payload.chunkSize} from ${sensorMessage.sensorId}`);

            ekmData.chunkSize = sensorMessage.payload.chunkSize;
            ekmData.chunkToRequest = 0;
            ekmData.numChunks = sensorMessage.payload.numChunks;

            gateway.sendRS485ChunkRequest({
                chunkNumber: ekmData.chunkToRequest,
                chunkSize: ekmData.chunkSize,
                destination: sensorMessage.sensorId
            });
        } else if (sensorMessage.type === 'rs485ChunkResponse') {
            if (ekmData.chunkToRequest < (ekmData.numChunks - 1)) {
                ekmData.dataChunks.push(sensorMessage.payload.data);
                ekmData.chunkToRequest++;

                gateway.sendRS485ChunkRequest({
                    chunkNumber: ekmData.chunkToRequest,
                    chunkSize: ekmData.chunkSize,
                    destination: sensorMessage.sensorId
                });
            } else {
                // Drop the last byte from the final chunk.
                ekmData.dataChunks.push(sensorMessage.payload.data.substring(0, sensorMessage.payload.data.length - 2));

                console.log('Done, complete response:');
                console.log(ekmData.dataChunks.join(''));
            }
        } else {
            console.log(sensorMessage);
        }
    },
    onGatewayReady: () => {
        console.log('Gateway is ready.');

        // One off... Configure RS485 for our meter device.
        // Only needs doing once, settings are retained in the RS485 sensor.
        // gateway.sendRS485ConfigMessage({
        //     baudRate: 9600,
        //     parity: gateway.PARITY_NONE,
        //     stopBits: 1,
        //     bitMask: 7,
        //     destination: 'dfbc'
        // });

        // Send EKM v3 meter message
        gateway.sendRS485Request({
            message: `2F3F${METER_SERIAL_NUMBER_HEX}210D0A`,
            destination: 'dfbc',
            hexEncodePayload: false
        });
    }
});
