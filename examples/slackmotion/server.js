const gateway = require('conectric-usb-gateway');
const Slack = require('slack-node');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const MOTION_REPORTING_CHANNEL = process.env.MOTION_REPORTING_CHANNEL;
let MOTION_REPORTING_INTERVAL = process.env.MOTION_REPORTING_INTERVAL; // Seconds

if (! MOTION_REPORTING_INTERVAL || ! MOTION_REPORTING_CHANNEL || ! SLACK_WEBHOOK_URL) {
    console.error('Please set the following environment variables: MOTION_REPORTING_INTERVAL, MOTION_REPORTING_CHANNEL, SLACK_WEBHOOK_URL');
    process.exit(1);
}

MOTION_REPORTING_INTERVAL = parseInt(MOTION_REPORTING_INTERVAL);

let lastMotionTime = 0;
const slack = new Slack();

slack.setWebhook(SLACK_WEBHOOK_URL);

gateway.runGateway({
    onSensorMessage: (sensorMessage) => {
        if ((sensorMessage.type === 'motion') && (sensorMessage.timestamp >= (lastMotionTime + MOTION_REPORTING_INTERVAL))) {
            const motionMessageStr = `Motion detected by sensor ${sensorMessage.sensorId}.`;
            
            console.log(`Sending message to Slack: ${motionMessageStr}.`);
            lastMotionTime = sensorMessage.timestamp;

            slack.webhook({ 
                text: motionMessageStr,
                channel: `#${MOTION_REPORTING_CHANNEL}`,
                username: 'Conectric',
                icon_emoji: ':wave:'
            }, (err, response) => {
                if (err) {
                    console.error(`Error posting to Slack: ${JSON.stringify(err)}`);
                } else {
                    console.log(`Message posted to Slack: ${response.response}`);
                }
            });
        } 
    }
});
