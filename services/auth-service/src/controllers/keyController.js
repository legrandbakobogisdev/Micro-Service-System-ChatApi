const DeviceKey = require('../models/DeviceKey');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { ValidationError, NotFoundError } = require('../../shared/utils/errorHandler');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('auth-service');

/**
 * @desc Upload E2EE keys, Device Info and FCM Token
 * @route POST /api/auth/keys
 * @access Private
 */
exports.uploadKeys = asyncHandler(async (req, res) => {
    const { deviceId, registrationId, identityKey, signedPreKey, oneTimePreKeys, deviceInfo, fcmToken } = req.body;
    const userId = req.user.id;

    // Save or update the keys in DB
    let deviceKey = await DeviceKey.findOne({ userId, deviceId });

    if (deviceKey) {
        deviceKey.registrationId = registrationId;
        deviceKey.identityKey = identityKey;
        deviceKey.signedPreKey = signedPreKey;
        deviceKey.oneTimePreKeys = oneTimePreKeys;
        await deviceKey.save();
    } else {
        deviceKey = await DeviceKey.create({
            userId,
            deviceId,
            registrationId,
            identityKey,
            signedPreKey,
            oneTimePreKeys
        });
    }

    // Publish event for notification-service to pick up FCM Token & Device info
    try {
        const producer = getProducer('auth-service');
        await producer.sendMessage('device.registered', {
            userId,
            deviceId,
            fcmToken,
            deviceInfo // e.g., { os: 'ios', osVersion: '17.1', appVersion: '1.0.0' }
        });
    } catch (error) {
        logger.error('Failed to publish device.registered event:', error);
    }

    return ApiResponse.success(res, null, 'Device keys and metadata uploaded successfully');
});

/**
 * @desc Get keys for a specific user to start an E2EE chat
 * @route GET /api/auth/keys/:userId
 * @access Private
 */
exports.getKeys = asyncHandler(async (req, res) => {
    const targetUserId = req.params.userId;
    const { deviceId } = req.query; // Explicitly request a specific device if needed

    let query = { userId: targetUserId };
    if (deviceId) {
        query.deviceId = deviceId;
    }

    const deviceKeys = await DeviceKey.find(query);

    if (!deviceKeys || deviceKeys.length === 0) {
        throw new NotFoundError('No devices found for this user');
    }

    // For each device, we pop ONE oneTimePreKey to send back and delete it from DB
    const results = [];

    for (const d of deviceKeys) {
        let oneTimePreKey = null;
        if (d.oneTimePreKeys && d.oneTimePreKeys.length > 0) {
            oneTimePreKey = d.oneTimePreKeys.shift(); // Take the first one
            await d.save(); // Save after removing the key
        }

        results.push({
            deviceId: d.deviceId,
            registrationId: d.registrationId,
            identityKey: d.identityKey,
            signedPreKey: d.signedPreKey,
            oneTimePreKey: oneTimePreKey // Will be null if depleted
        });
    }

    return ApiResponse.success(res, results, 'Keys retrieved successfully');
});

/**
 * @desc Replenish depleted One-Time PreKeys
 * @route POST /api/auth/keys/replenish
 * @access Private
 */
exports.replenishKeys = asyncHandler(async (req, res) => {
    const { deviceId, oneTimePreKeys } = req.body;
    const userId = req.user.id;

    const deviceKey = await DeviceKey.findOne({ userId, deviceId });

    if (!deviceKey) {
        throw new NotFoundError('Device not found');
    }

    deviceKey.oneTimePreKeys.push(...oneTimePreKeys);
    await deviceKey.save();

    return ApiResponse.success(res, { count: deviceKey.oneTimePreKeys.length }, 'One-Time PreKeys replenished');
});
