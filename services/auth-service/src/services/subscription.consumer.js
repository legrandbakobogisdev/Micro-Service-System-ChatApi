const { getConsumer } = require('../../shared/kafka-config/consumer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const User = require('../models/User');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('auth-service:subscription-consumer');

class SubscriptionConsumer {
    constructor() {
        this.consumer = getConsumer('auth-service', 'auth-subscription-group');
        this.isConnected = false;
    }

    async start() {
        try {
            await this.consumer.connect();
            this.isConnected = true;
            await this.consumer.subscribe([TOPICS.SUBSCRIPTION_CREATED, TOPICS.SUBSCRIPTION_EXPIRED]);

            await this.consumer.consume(async (topic, payload) => {
                logger.info(`Received subscription event ${topic}:`, payload);

                if (topic === TOPICS.SUBSCRIPTION_CREATED) {
                    await this._handleSubscriptionCreated(payload);
                } else if (topic === TOPICS.SUBSCRIPTION_EXPIRED) {
                    await this._handleSubscriptionExpired(payload);
                }
            });
        } catch (error) {
            logger.error('Failed to start subscription consumer:', error);
        }
    }

    async _handleSubscriptionCreated(payload) {
        const { userId } = payload;
        try {
            const user = await User.findByIdAndUpdate(userId, { isPremium: true }, { new: true });
            if (user) {
                logger.info(`User ${userId} status updated to PREMIUM in auth-service`);
            } else {
                logger.warn(`User ${userId} not found for premium update`);
            }
        } catch (error) {
            logger.error(`Error updating user ${userId} to premium:`, error);
        }
    }

    async _handleSubscriptionExpired(payload) {
        const { userId } = payload;
        try {
            const user = await User.findByIdAndUpdate(userId, { isPremium: false }, { new: true });
            if (user) {
                logger.info(`User ${userId} premium status EXPIRED in auth-service`);
            }
        } catch (error) {
            logger.error(`Error removing premium status for user ${userId}:`, error);
        }
    }

    async stop() {
        if (this.isConnected) {
            await this.consumer.disconnect();
            this.isConnected = false;
        }
    }
}

module.exports = new SubscriptionConsumer();
