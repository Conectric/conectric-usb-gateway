const gateway = require('conectric-usb-gateway');
const request = require('request');

gateway.runGateway({
    onSensorMessage: (sensorMessage) => {
        console.log(JSON.stringify(sensorMessage));

        request.post({
            url: 'http://127.0.0.1:8000/sensordata',
            body: {
                senderId: `gateway-${gateway.macAddress}`,
                timestamp: Date.now(),
                message: sensorMessage
            },
            json: true
        },
        (err, response, body) => {
            if ((! err) && (response.statusCode === 200)) {
                console.log('Messaage sent to server.');
            } else {
                console.error(`Error sending to server: ${err}`);
                if (response) {
                    console.error(`Status code was: ${(response.statusCode ? response.statusCode : 'undefined')}`);
                } else {
                    console.error(`No response from server.`);
                }
                console.error((body ? JSON.stringify(body) : 'No response body from server.'));
            }
        });
    }
});