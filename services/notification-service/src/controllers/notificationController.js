const Notification = require('../models/Notification');
const PushService = require('../services/pushService');
const { createLogger } = require('../../shared/utils/logger');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');
const { ValidationError } = require('../../shared/utils/errorHandler');
const mongoose = require('mongoose');

const logger = createLogger('notification-service');

const DeviceRegistry = require('../models/DeviceRegistry');

/**
 * @desc Health check
 * @route GET /api/notification/health
 * @access Public
 */
exports.health = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, { status: 'healthy', service: 'notification-service' }, 'Service is healthy');
});

/**
 * @desc Send a test push notification to a user
 * @route POST /api/notification/test
 * @access Private
 */
exports.sendTestNotification = asyncHandler(async (req, res) => {
    const { userId, title, body, data } = req.body;
    
    if (!userId || !title || !body) {
        throw new ValidationError('User ID, Title, and Body are required for testing');
    }

    const result = await PushService.sendToUser(userId, { title, body, data: data || {} }, 'test');
    
    if (result) {
        return ApiResponse.success(res, null, `Test notification sent successfully to user ${userId}`);
    } else {
        return ApiResponse.error(res, 'Failed to send test notification. Check if the user has active devices.');
    }
});

/**
 * @desc Register or update user device FCM token
 * @route POST /api/notification/devices
 * @access Private
 */
exports.registerDevice = asyncHandler(async (req, res) => {
    const { deviceId, fcmToken, deviceInfo } = req.body;
    const userId = req.headers['x-user-id']; // In production, verify this with JWT

    if (!userId || !deviceId || !fcmToken) {
        throw new ValidationError('User ID, Device ID, and FCM Token are required');
    }

    const device = await DeviceRegistry.findOneAndUpdate(
        { userId, deviceId },
        { fcmToken, deviceInfo, isActive: true, lastUpdated: new Date() },
        { upsert: true, new: true }
    );

    logger.info(`Device ${deviceId} registered for user ${userId}`);
    return ApiResponse.success(res, device, 'Device registered successfully');
});

/**
 * @desc Get notification history for a user
 * @route GET /api/notification/history
 * @access Private
 */
exports.getHistory = asyncHandler(async (req, res) => {
    const userId = req.headers['x-user-id']; 
    
    if (!userId) {
        return ApiResponse.unauthorized(res, 'User ID missing');
    }

    const notifications = await Notification.find({ userId: mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(50);
        
    logger.info(`Retrieved history for user ${userId} (${notifications.length} items)`);
    return ApiResponse.success(res, notifications, 'Notification history retrieved');
});

/**
 * @desc Handle notification action (reply, mark as read, etc.)
 * @route POST /api/notification/actions
 * @access Private
 */
exports.handleNotificationAction = asyncHandler(async (req, res) => {
    const { action, messageId, conversationId, replyText } = req.body;
    const userId = req.headers['x-user-id'] || req.user?.id;

    if (!action || !conversationId) {
        throw new ValidationError('Action and Conversation ID are required');
    }

    logger.info(`Handling notification action: ${action} for user ${userId} in conversation ${conversationId}`);

    // Publish event to chat-service via Kafka
    try {
        const producer = require('../../shared/kafka-config/producer').getProducer('notification-service');
        
        if (action === 'REPLY' && replyText) {
            // Publish reply event
            await producer.sendMessage('chat.notification_reply', {
                userId,
                conversationId,
                messageId,
                replyText,
                timestamp: new Date()
            });
            
            return ApiResponse.success(res, null, 'Reply sent from notification');
        } else if (action === 'MARK_AS_READ') {
            // Publish mark as read event
            await producer.sendMessage('chat.notification_mark_read', {
                userId,
                conversationId,
                messageId,
                timestamp: new Date()
            });
            
            return ApiResponse.success(res, null, 'Conversation marked as read from notification');
        } else {
            throw new ValidationError('Unknown action');
        }
    } catch (err) {
        logger.error(`Failed to handle notification action:`, err.message);
        throw err;
    }
});
