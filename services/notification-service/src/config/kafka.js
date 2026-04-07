const { KafkaConsumer } = require('../../shared/kafka-config/consumer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const EventHandler = require('../services/eventHandler');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('notification-service');

const consumer = new KafkaConsumer('notification-service', 'notification-service-group');

async function connectConsumer() {
    try {
        await consumer.connect();

        const topicsToSubscribe = [
            TOPICS.DEVICE_REGISTERED,
            TOPICS.USER_LOGGED_IN,
            TOPICS.USER_VERIFIED,
            TOPICS.CHAT_MESSAGE_SENT,
            TOPICS.PAYMENT_SUCCESS,
            TOPICS.PAYMENT_FAILED,
            TOPICS.SUBSCRIPTION_CREATED,
            TOPICS.SUBSCRIPTION_EXPIRED,
            TOPICS.TICKET_CREATED,
            TOPICS.TICKET_UPDATED,
            TOPICS.SESSION_REVOKED,
            TOPICS.CHAT_CONTACTS_SYNCED,
            TOPICS.USER_CREATED
        ];

        await consumer.subscribe(topicsToSubscribe);

        await consumer.consume(async (topic, data) => {
            logger.info(`Received event on topic ${topic}:`, data);

            switch (topic) {
                case TOPICS.DEVICE_REGISTERED:
                    await EventHandler.handleDeviceRegistered(data);
                    break;
                case TOPICS.USER_LOGGED_IN:
                    await EventHandler.handleUserLoggedIn(data);
                    break;
                case TOPICS.CHAT_MESSAGE_SENT:
                case 'chat.message_sent': // Support both formats if necessary
                    await EventHandler.handleChatMessage(data);
                    break;
                case TOPICS.PAYMENT_SUCCESS:
                case TOPICS.PAYMENT_FAILED:
                    await EventHandler.handlePaymentEvent({ ...data, status: topic === TOPICS.PAYMENT_SUCCESS ? 'success' : 'failed' });
                    break;
                case TOPICS.SUBSCRIPTION_CREATED:
                case TOPICS.SUBSCRIPTION_EXPIRED:
                    await EventHandler.handleSubscriptionEvent({ ...data, eventType: topic === TOPICS.SUBSCRIPTION_CREATED ? 'created' : 'expired' });
                    break;
                case TOPICS.TICKET_CREATED:
                case TOPICS.TICKET_UPDATED:
                    await EventHandler.handleSupportMessage(data);
                    break;
                case TOPICS.CHAT_CONTACTS_SYNCED:
                    await EventHandler.handleContactsSynced(data);
                    break;
                case TOPICS.USER_CREATED:
                    await EventHandler.handleUserCreated(data);
                    break;
            }
        });
    } catch (error) {
        logger.error('Failed to setup Kafka consumer:', error);
    }
}

async function disconnectConsumer() {
    await consumer.disconnect();
}

module.exports = { connectConsumer, disconnectConsumer };
