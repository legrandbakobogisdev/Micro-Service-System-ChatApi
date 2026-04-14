const { getConsumer } = require('../../shared/kafka-config/consumer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('media-service');
let consumer = null;

const mediaService = require('../services/media.service');

async function connectConsumer() {
    try {
        const groupId = process.env.KAFKA_GROUP_ID || 'media-service-group';
        consumer = getConsumer('media-service', groupId);
        await consumer.connect();

        // Subscribe to relevant topics
        await consumer.subscribe([
            TOPICS.USER_DELETED,
            TOPICS.STORY_DELETED,
            TOPICS.CHAT_MESSAGE_DELETED,
            TOPICS.MEDIA_PROCESSED
        ]);

        await consumer.consume(async (topic, message) => {
            logger.info(`Received message from topic ${topic}`);
            
            try {
                if (topic === TOPICS.STORY_DELETED) {
                    const { storyId, content } = message;
                    const result = await mediaService.deleteByOwnerId(storyId);
                    if (result.count === 0 && content) {
                        await mediaService.deleteByUrl(content);
                    }
                } else if (topic === TOPICS.CHAT_MESSAGE_DELETED) {
                    const { messageId, url } = message;
                    const result = await mediaService.deleteByOwnerId(messageId);
                    if (result.count === 0 && url) {
                        await mediaService.deleteByUrl(url);
                    }
                } else if (topic === TOPICS.MEDIA_PROCESSED) {
                    const { mediaId, action } = message;
                    logger.info(`Processing background task for media ${mediaId}: ${action}`);
                    // Here you would implement virus scanning, transcoding, etc.
                    // For now we just log it as "Pro" simulation.
                } else if (topic === TOPICS.USER_DELETED) {
                    // Could also delete all media for a user
                }
            } catch (err) {
                logger.error(`Error processing Kafka message for topic ${topic}:`, err);
            }
        });

        return true;
    } catch (error) {
        logger.error('Failed to connect Kafka consumer:', error);
        return false;
    }
}

async function disconnectConsumer() {
    if (consumer) {
        await consumer.disconnect();
    }
}

module.exports = { connectConsumer, disconnectConsumer };
