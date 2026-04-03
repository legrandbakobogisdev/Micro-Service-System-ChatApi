const { Kafka } = require('kafkajs');
const { createLogger } = require('../utils/logger');

class KafkaConsumer {
    constructor(serviceName, groupId) {
        this.serviceName = serviceName;
        this.groupId = groupId;
        this.logger = createLogger(serviceName);
        this.consumer = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
            const kafka = new Kafka({
                clientId: process.env.KAFKA_CLIENT_ID || this.serviceName,
                brokers,
                retry: { initialRetryTime: 300, retries: 10 },
                logLevel: 0
            });
            this.consumer = kafka.consumer({ groupId: this.groupId });
            await this.consumer.connect();
            this.isConnected = true;
            this.logger.info(`Kafka consumer connected (group: ${this.groupId})`);
        } catch (error) {
            this.logger.error('Failed to connect Kafka consumer:', error);
            throw error;
        }
    }

    async subscribe(topics) {
        if (!this.isConnected) throw new Error('Consumer not connected');
        for (const topic of topics) {
            await this.consumer.subscribe({ topic, fromBeginning: false });
        }
        this.logger.info(`Subscribed to topics: ${topics.join(', ')}`);
    }

    async consume(handler) {
        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const value = JSON.parse(message.value.toString());
                    await handler(topic, value, { partition, offset: message.offset, headers: message.headers });
                } catch (error) {
                    this.logger.error(`Error processing message from ${topic}:`, error);
                }
            }
        });
    }

    async disconnect() {
        if (this.consumer && this.isConnected) {
            await this.consumer.disconnect();
            this.isConnected = false;
            this.logger.info('Kafka consumer disconnected');
        }
    }
}

module.exports = { KafkaConsumer };
