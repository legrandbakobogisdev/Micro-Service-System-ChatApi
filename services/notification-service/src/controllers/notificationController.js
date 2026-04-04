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
