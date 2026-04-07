const { createLogger } = require('../../shared/utils/logger');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { redisClient } = require('../config/redis');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const logger = createLogger('chat-handler');

module.exports = (io, socket) => {
    const userId = socket.user.id;

    // ─────────────────────────────────────────
    // ROOM MANAGEMENT
    // ─────────────────────────────────────────

    /**
     * Join a specific conversation room and optionally fetch participant status
     */
    socket.on('join_conversation', async (data) => {
        const conversationId = typeof data === 'string' ? data : data.conversationId;
        const participants = data.participants || [];

        socket.join(conversationId);
        logger.debug(`User ${userId} joined room ${conversationId}`);

        // If participants provided, sync their state immediately (Feature Optimization)
        if (Array.isArray(participants) && participants.length > 0) {
            try {
                const statusMap = {};
                for (const targetId of participants) {
                    if (targetId === userId) continue;
                    const count = await redisClient.hLen(`presence:${targetId}`);
                    statusMap[targetId] = count > 0 ? 'online' : 'offline';
                }
                socket.emit('presence_sync', statusMap);
            } catch (err) {
                logger.warn('Presence sync during join failed:', err.message);
            }
        }

        socket.emit('joined_conversation', conversationId);
    });

    /**
     * Leave a conversation room
     */
    socket.on('leave_conversation', (conversationId) => {
        socket.leave(conversationId);
        logger.debug(`User ${userId} left room ${conversationId}`);
        socket.emit('left_conversation', conversationId);
    });

    // ─────────────────────────────────────────
    // TYPING INDICATORS
    // ─────────────────────────────────────────

    socket.on('typing_start', (conversationId) => {
        socket.to(conversationId).emit('user_typing_start', {
            conversationId,
            userId
        });

        // Kafka event for cross-service awareness
        publishKafkaEvent(TOPICS.CHAT_TYPING, {
            conversationId,
            userId,
            isTyping: true
        });
    });

    socket.on('typing_stop', (conversationId) => {
        socket.to(conversationId).emit('user_typing_stop', {
            conversationId,
            userId
        });
    });

    // ─────────────────────────────────────────
    // PRESENCE MANAGEMENT (Feature 8 - multi-device)
    // ─────────────────────────────────────────

    /**
     * Set user as online with device info
     */
    socket.on('set_online', async (data = {}) => {
        const { deviceId } = data;

        // Store presence in Redis for multi-device tracking
        try {
            // Cleanup stale sessions for the SAME deviceId (to avoid ghosts)
            const existing = await redisClient.hGetAll(`presence:${userId}`);
            for (const [sid, dataStr] of Object.entries(existing)) {
                try {
                    const d = JSON.parse(dataStr);
                    if (d.deviceId === (deviceId || socket.id) || sid === socket.id) {
                        await redisClient.hDel(`presence:${userId}`, sid);
                    }
                } catch (e) {}
            }

            await redisClient.hSet(`presence:${userId}`, socket.id, JSON.stringify({
                deviceId: deviceId || socket.id,
                status: 'online',
                connectedAt: new Date().toISOString()
            }));
            await redisClient.expire(`presence:${userId}`, 86400); // 24h TTL
        } catch (err) {
            logger.warn('Redis presence set failed:', err.message);
        }

        socket.broadcast.emit('user_status_changed', {
            userId,
            status: 'online',
            deviceId
        });

        // Kafka event for other services
        publishKafkaEvent(TOPICS.USER_ONLINE, {
            userId,
            deviceId,
            socketId: socket.id
        });
    });

    /**
     * Check current status of multiple users (initial sync)
     */
    socket.on('check_presence', async (userIds) => {
        if (!Array.isArray(userIds)) return;
        
        try {
            const statusMap = {};
            for (const targetId of userIds) {
                const count = await redisClient.hLen(`presence:${targetId}`);
                statusMap[targetId] = count > 0 ? 'online' : 'offline';
            }
            socket.emit('presence_sync', statusMap);
        } catch (err) {
            logger.warn('Presence check failed:', err.message);
        }
    });

    /**
     * Mark all messages in a conversation as read (batch) — multi-device sync
     */
    socket.on('mark_conversation_read', async ({ conversationId, deviceId }) => {
        const now = new Date();
        
        try {
            // 1. Persist to DB: update unreadCount for this user
            const conversation = await Conversation.findOneAndUpdate(
                { _id: conversationId, participants: userId },
                { $set: { [`unreadCounts.${userId}`]: 0 } },
                { new: true }
            );

            if (conversation) {
                // 2. Persist to DB: mark individual messages read (performance note: slow on large chats)
                await Message.updateMany(
                    { conversationId, senderId: { $ne: userId }, 'readBy.userId': { $ne: userId } },
                    { $push: { readBy: { userId, deviceId, at: now } }, $set: { status: 'read' } }
                );

                // 3. Kafka event for cross-service sync (analytics, notifications)
                publishKafkaEvent(TOPICS.CHAT_MESSAGES_READ_ALL, {
                    conversationId,
                    userId,
                    deviceId,
                    readAt: now
                });
            }
        } catch (err) {
            logger.error(`Failed to execute batch read in DB for user ${userId}:`, err.message);
        }

        // 4. Socket UI sync
        // Emit to all of this user's other devices (Feature 8)
        socket.to(userId).emit('sync_conversation_read', {
            conversationId,
            deviceId,
            readAt: now
        });

        // Notify other participants that user has read (Batch status) - mapped to 'messages_read' for UI compat
        socket.to(conversationId).emit('messages_read', {
            conversationId,
            readerId: userId,
            at: now
        });
    });

    /**
     * Edit message content (Feature Optimization)
     */
    socket.on('edit_message', async ({ messageId, content }) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) return;

            if (message.senderId.toString() !== userId) {
                return logger.warn(`User ${userId} tried to edit message sent by ${message.senderId}`);
            }
            
            if (message.isDeleted) {
                return logger.warn(`User ${userId} tried to edit deleted message ${messageId}`);
            }

            message.content = content;
            message.isEdited = true;
            message.editedAt = new Date();
            await message.save();

            // Notify everyone in the room (including sender's other devices)
            io.to(message.conversationId.toString()).emit('message_updated', {
                messageId: message._id,
                conversationId: message.conversationId,
                content: message.content,
                isEdited: true,
                editedAt: message.editedAt
            });

            // Kafka event for cross-serviceAwareness
            publishKafkaEvent(TOPICS.CHAT_MESSAGE_UPDATED, {
                messageId: message._id,
                conversationId: message.conversationId,
                content: message.content,
                senderId: message.senderId,
                editedAt: message.editedAt
            });
        } catch (err) {
            logger.error(`Failed to edit message ${messageId}:`, err.message);
        }
    });

    // ─────────────────────────────────────────
    // DISCONNECT
    // ─────────────────────────────────────────

    socket.on('disconnecting', async () => {
        const lastSeen = new Date().toISOString();

        // 1. Remove from Redis (simple cleanup)
        try {
            await redisClient.hDel(`presence:${userId}`, socket.id);
        } catch (e) {}

        // 2. Broadcast OFFLINE immediately to everyone (Simplicity first)
        socket.broadcast.emit('user_status_changed', {
            userId,
            status: 'offline',
            lastSeen
        });

        // 3. Kafka event
        publishKafkaEvent(TOPICS.USER_OFFLINE, {
            userId,
            lastSeen
        });
        
        logger.info(`User ${userId} disconnected and set to offline`);
    });
};

/**
 * Helper to publish Kafka events (non-blocking)
 */
function publishKafkaEvent(topic, data) {
    try {
        const producer = getProducer('chat-service');
        if (producer.isConnected) {
            producer.sendMessage(topic, data).catch(err => {
                logger.warn(`Kafka publish to ${topic} failed:`, err.message);
            });
        }
    } catch (err) {
        // Silent fail — Kafka not critical for socket events
    }
}
