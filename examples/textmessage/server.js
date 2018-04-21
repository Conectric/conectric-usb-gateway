// Basic example to send a text message to another USB router.

const gateway = require('conectric-usb-gateway');

// Last 4 of destination router mac addr eg da40
const DESTINATION_ROUTER_ADDR = process.env.DESTINATION_ROUTER_ADDR;

if (! DESTINATION_ROUTER_ADDR) {
    console.error('Please set the following environment variable: DESTINATION_ROUTER_ADDR');
    process.exit(1);
}

gateway.runGateway({
    onSensorMessage: (sensorMessage) => {
        console.log(sensorMessage);
    },
    onGatewayReady: () => {
        console.log('Gateway is ready.');
        const res = gateway.sendTextMessage({
            message: 'Hello World this is a test!',
            destination: DESTINATION_ROUTER_ADDR
        });

        console.log(`${res === true ? 'Message sent.' : 'Error sending message.'}`);
    }
});