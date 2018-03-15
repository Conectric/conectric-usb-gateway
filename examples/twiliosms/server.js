const gateway = require('conectric-usb-gateway');
const twilio = require('twilio');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_DESTINATION_PHONE_NUMBER = process.env.TWILIO_DESTINATION_PHONE_NUMBER;

if (! TWILIO_ACCOUNT_SID || ! TWILIO_AUTH_TOKEN || ! TWILIO_PHONE_NUMBER || ! TWILIO_DESTINATION_PHONE_NUMBER) {
    console.error('Please set all of the following environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_DESTINATION_PHONE_NUMBER');
    process.exit(1);
}

const twilioClient = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

gateway.runGateway({
    onSensorMessage: (sensorMessage) => {
        if ((sensorMessage.type === 'switch') && (sensorMessage.payload.switch === true)) {
            console.log(`Door opened, sending SMS message!`);

            twilioClient.messages.create({
                body: `Sensor ${sensorMessage.sensorId}: door opened!`,
                to: TWILIO_DESTINATION_PHONE_NUMBER,
                from: TWILIO_PHONE_NUMBER
            }).then((message) => {
                console.log(`Sent SMS via Twilio, message sid = ${message.sid}`);
            });
        }
    }
});