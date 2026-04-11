const { KafkaConsumer } = require('../../shared/kafka-config/consumer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { createLogger } = require('../../shared/utils/logger');
const { getIO } = require('../socket');
const Conversation = require('../models/Conversation');

const logger = createLogger('chat-kafka');

const consumer = new KafkaConsumer('chat-service', 'chat-service-group');

async function connectConsumer() {
    try {
        await consumer.connect();

        const topicsToSubscribe = [
            TOPICS.USER_BLOCKED,
            TOPICS.USER_UNBLOCKED,
            TOPICS.STORY_CREATED,
            TOPICS.STORY_VIEWED,
            TOPICS.STORY_DELETED,
            TOPICS.SUBSCRIPTION_CREATED
        ];

        await consumer.subscribe(topicsToSubscribe);

        await consumer.consume(async (topic, data) => {
            logger.info(`Received event on topic ${topic}:`, data);

            const io = getIO();

            switch (topic) {
                case TOPICS.SUBSCRIPTION_CREATED:
                    const { userId, planId, expiresAt } = data;
                    logger.info(`Notifying user ${userId} of premium upgrade via socket`);
                    
                    // Notify the specific user's personal room
                    io.to(userId).emit('premium_updated', {
                        isPremium: true,
                        planId,
                        expiresAt,
                        timestamp: new Date().toISOString()
                    });
                    break;

                case TOPICS.USER_BLOCKED:
                case TOPICS.USER_UNBLOCKED:
                    const { blockerId, blockedId } = data;
                    const status = topic === TOPICS.USER_BLOCKED ? 'blocked' : 'unblocked';
                    try {
                        // 1. Sync MongoDB: Update all individual conversations between these two users
                        const update = topic === TOPICS.USER_BLOCKED 
                            ? { $addToSet: { blockedBy: blockerId } } 
                            : { $pull: { blockedBy: blockerId } };

                        const conversations = await Conversation.find({
                            type: 'individual',
                            participants: { $all: [blockerId, blockedId] }
                        });

                        for (const conv of conversations) {
                            await Conversation.findByIdAndUpdate(conv._id, update);
                            
                            // Notify participants via socket for THIS specific conversation
                            io.to(conv._id.toString()).emit('conversation_block_status', {
                                conversationId: conv._id,
                                blockedBy: topic === TOPICS.USER_BLOCKED 
                                    ? [...new Set([...conv.blockedBy, blockerId])]
                                    : conv.blockedBy.filter(id => id.toString() !== blockerId),
                                status
                            });
                        }

                        // 2. Notify users globally
                        io.to(blockerId).emit('user_block_status', { targetUserId: blockedId, status });
                        io.to(blockedId).emit('user_block_status', { blockerId: blockerId, status });

                        logger.info(`Global ${status} sync completed for ${blockerId} -> ${blockedId}`);
                    } catch (err) {
                        logger.error(`Error during block/unblock sync:`, err.message);
                    }
                    break;

                case TOPICS.STORY_CREATED:
                    // Broadcast new story notification - front-end will check if it's a contact
                    io.emit('story_new', {
                        storyId: data.storyId,
                        userId: data.userId,
                        type: data.type,
                        createdAt: data.createdAt
                    });
                    break;

                case TOPICS.STORY_VIEWED:
                    // Only notify the author of the story
                    if (data.authorId) {
                        io.to(data.authorId.toString()).emit('story_view_update', {
                            storyId: data.storyId,
                            viewerId: data.viewerId,
                            viewedAt: data.viewedAt
                        });
                    }
                    break;

                case TOPICS.STORY_DELETED:
                    // Broadcast deletion so UI removes it
                    io.emit('story_deleted', {
                        storyId: data.storyId,
                        userId: data.userId
                    });
                    break;
            }
        });
    } catch (error) {
        logger.error('Failed to setup Kafka consumer for Chat Service:', error);
    }
}

async function disconnectConsumer() {
    await consumer.disconnect();
}

module.exports = { connectConsumer, disconnectConsumer };
