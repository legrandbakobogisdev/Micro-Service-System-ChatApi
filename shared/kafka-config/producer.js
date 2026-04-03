const { Kafka } = require('kafkajs');
const { createLogger } = require('../utils/logger');
const { getCorrelationId } = require('../utils/tracing');

class KafkaProducer {
    constructor(serviceName = 'chatapp') {
        this.serviceName = serviceName;
        this.logger = createLogger(serviceName);
        this.producer = null;
        this.kafka = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
            this.kafka = new Kafka({
                clientId: process.env.KAFKA_CLIENT_ID || this.serviceName,
                brokers,
                retry: { initialRetryTime: 300, retries: 10 },
                logLevel: 0
            });
            this.producer = this.kafka.producer({
                allowAutoTopicCreation: true,
                transactionalId: `${this.serviceName}-producer`,
                maxInFlightRequests: 5,
                idempotent: true
            });
            await this.producer.connect();
            this.isConnected = true;
            this.logger.info('Kafka producer connected successfully');
        } catch (error) {
            this.logger.error('Failed to connect Kafka producer:', error);
            throw error;
        }
    }

    async sendMessage(topic, message, key = null) {
        if (!this.isConnected) throw new Error('Kafka producer not connected.');
        try {
            const headers = {
                'content-type': 'application/json',
                'producer-service': String(this.serviceName || 'unknown'),
                'x-correlation-id': String(getCorrelationId() || 'none')
            };
            const payload = {
                topic,
                messages: [{
                    key: String(key || Date.now()),
                    value: JSON.stringify({ ...message, timestamp: new Date().toISOString(), service: this.serviceName }),
                    headers
                }]
            };
            const result = await this.producer.send(payload);
            this.logger.info(`Message sent to topic: ${topic}`, { topic, partition: result[0].partition, offset: result[0].offset });
            return result;
        } catch (error) {
            this.logger.error(`Failed to send message to topic ${topic}:`, error);
            throw error;
        }
    }

    async disconnect() {
        if (this.producer && this.isConnected) {
            await this.producer.disconnect();
            this.isConnected = false;
            this.logger.info('Kafka producer disconnected');
        }
    }
}

let producerInstance = null;
function getProducer(serviceName = process.env.SERVICE_NAME || 'chatapp') {
    if (!producerInstance) producerInstance = new KafkaProducer(serviceName);
    return producerInstance;
}

module.exports = { KafkaProducer, getProducer };
