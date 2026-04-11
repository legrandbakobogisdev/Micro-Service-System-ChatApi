const { getConsumer } = require('../../shared/kafka-config/consumer');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const Subscription = require('../models/Subscription');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('subscription-service:consumer');

class PaymentConsumer {
    constructor() {
        this.consumer = getConsumer('subscription-service', 'subscription-service-group');
    }

    async start() {
        await this.consumer.connect();
        await this.consumer.subscribe([TOPICS.PAYMENT_SUCCESS]);

        await this.consumer.consume(async (topic, payload) => {
            logger.info(`Received event ${topic}:`, payload);
            if (topic === TOPICS.PAYMENT_SUCCESS) {
                await this._handlePaymentSuccess(payload);
            }
        });
    }

    async _handlePaymentSuccess(payload) {
        const { userId, transactionId } = payload;
        
        try {
            // Set end date to 1 month from now by default for premium
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 1);

            const subscription = await Subscription.findOneAndUpdate(
                { userId },
                {
                    plan: 'premium',
                    status: 'active',
                    startDate: new Date(),
                    endDate,
                    lastPaymentId: transactionId
                },
                { upsert: true, new: true }
            );

            logger.info(`User ${userId} upgraded to PREMIUM. Subscription valid until ${endDate}`);

            // Emit Subscription Created event
            await this._publishEvent(TOPICS.SUBSCRIPTION_CREATED, {
                userId,
                plan: 'premium',
                endDate,
                transactionId
            });
        } catch (error) {
            logger.error(`Failed to update subscription for user ${userId}:`, error);
        }
    }

    async _publishEvent(topic, payload) {
        try {
            const producer = getProducer('subscription-service');
            await producer.sendMessage(topic, payload);
        } catch (error) {
            logger.error(`Failed to publish ${topic}:`, error);
        }
    }

    async stop() {
        await this.consumer.disconnect();
    }
}

module.exports = new PaymentConsumer();
