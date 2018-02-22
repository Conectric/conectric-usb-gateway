const gateway = require('conectric-usb-gateway');
const elasticsearch = require('elasticsearch');

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;
const ELASTICSEARCH_USER = process.env.ELASTICSEARCH_USER;
const ELASTICSEARCH_PASSWORD = process.env.ELASTICSEARCH_PASSWORD;
const ELASTICSEARCH_PORT = process.env.ELASTICSEARCH_PORT;

if (! ELASTICSEARCH_URL || ! ELASTICSEARCH_USER || ! ELASTICSEARCH_PASSWORD || ! ELASTICSEARCH_PORT) {
    console.error('Please set all of the following environment variables: ELASTICSEARCH_URL, ELASTICSEARCH_USER, ELASTICSEARCH_PASSWORD, ELASTICSEARCH_PORT');
    process.exit(1);
}

if ((! ELASTICSEARCH_URL.startsWith('http://')) && (! ELASTICSEARCH_URL.startsWith('https://'))) {
    console.error('The value of ELASTICSEARCH_URL must begin with http:// or https://');
}

const elasticSearchConnectURL = `${ELASTICSEARCH_URL.substring(0, ELASTICSEARCH_URL.indexOf('://') + 3)}${ELASTICSEARCH_USER}:${ELASTICSEARCH_PASSWORD}@${ELASTICSEARCH_URL.substring(ELASTICSEARCH_URL.indexOf('://') + 3)}:${ELASTICSEARCH_PORT}`;

const elasticClient = new elasticsearch.Client({
    hosts: [
        elasticSearchConnectURL
    ]
});

function checkElasticsearch(cb) {
    elasticClient.ping({}, (err, pingResult) => {
        if (! err) {
            console.log('Elasticsearch cluster is running!');
    
            elasticClient.indices.exists({
                index: 'temphumidityreadings'
            }, (err, indexResponse) => {
                if (err) {
                    cb(err, false);
                } else {
                    if (indexResponse === false) {
                        console.log('Creating Elasticsearch index temphumidityreadings.');
    
                        elasticClient.indices.create({
                            index: 'temphumidityreadings',
                            body: {
                                mappings: {
                                    tempHumidityReading: {
                                        properties: {
                                            battery: { type: 'float' },
                                            temperature: { type: 'float' },
                                            temperatureUnit: { type: 'text' },
                                            humidity: { type: 'float'},
                                            sensorId: { type: 'text' },
                                            timestamp: { type: 'date' }
                                        }
                                    }
                                }
                            }
                        }, (err, indexCreateResponse) => {
                            if (err) {
                                cb(err, false);
                            } else {
                                cb(null, true);
                            }
                        });
                    } else {
                        console.log('Found existing Elasticsearch index temphumidityreadings.');
                        cb(null, true);
                    }
                }
            });
        } else {
            cb('Failed to ping Elasticsearch cluster :(', false);
        }
    });  
}

checkElasticsearch((err, result) => {
    if ((! err) && (result === true)) {
        console.log('Elasticsearch connection OK.');

        gateway.runGateway({
            onSensorMessage: (sensorMessage) => {
                if (sensorMessage.type === 'tempHumidity') {
                    const d = new Date();
                    console.log(`${d.toDateString()} ${d.toTimeString()} received message: ${JSON.stringify(sensorMessage)}`);

                    elasticClient.create({
                        index: 'temphumidityreadings',
                        type: 'tempHumidityReading',
                        id: `${sensorMessage.sensorId}-${sensorMessage.sequenceNumber}-${sensorMessage.timestamp}`,
                        body: {
                            battery: sensorMessage.payload.battery,
                            temperature: sensorMessage.payload.temperature,
                            temperatureUnit: sensorMessage.payload.temperatureUnit,
                            humidity: sensorMessage.payload.humidity,
                            sensorId: sensorMessage.sensorId,
                            timestamp: (sensorMessage.timestamp * 1000)
                        }
                    }, (error, response) => {
                        if (error) {
                            console.error(`Error from Elasticsearch: ${JSON.stringify(error)}`);
                        } else {
                            console.log(`Sensor reading sent to Elasticsearch: ${JSON.stringify(response)}`);
                        }
                    });
                }
            },
            useFahrenheitTemps: true
        });
    } else {
        console.error('Error checking or establishing Elasticsearch index, or general connection error:');
        console.error((err) ? err : '<No Further Detail>');
    }
});

