const { body } = require('express-validator');
const { validate } = require('../../../../shared/utils/validator');

exports.registerDeviceValidation = [
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('fcmToken').notEmpty().withMessage('FCM Token is required'),
    body('deviceInfo').optional().isObject().withMessage('Device info must be an object'),
    body('deviceInfo.os').optional().trim(),
    body('deviceInfo.osVersion').optional().trim(),
    body('deviceInfo.model').optional().trim(),
    body('deviceInfo.appVersion').optional().trim(),
    validate
];

exports.sendTestNotificationValidation = [
    body('userId').notEmpty().withMessage('User ID is required'),
    body('title').notEmpty().trim().isLength({ min: 1, max: 100 }).withMessage('Title is required (max 100 chars)'),
    body('body').notEmpty().trim().isLength({ min: 1, max: 500 }).withMessage('Body is required (max 500 chars)'),
    body('data').optional().isObject().withMessage('Data must be an object'),
    validate
];
