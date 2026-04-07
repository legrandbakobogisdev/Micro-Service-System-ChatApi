const { body } = require('express-validator');
const { validate } = require('../../shared/utils/validator');

exports.registerValidation = [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
        .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
    body('firstName').optional().trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
    body('lastName').optional().trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
    body('username').optional().trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers and underscores'),
    body('phoneNumber').trim().isMobilePhone('any').withMessage('Valid phone number is required'),
    body('about').optional().trim().isLength({ max: 500 }).withMessage('About must be max 500 characters'),
    body('provider').optional().isIn(['email', 'google', 'apple']).withMessage('Invalid provider'),
    body('profilePhotoUrl').optional({ checkFalsy: true }).trim().isURL().withMessage('Profile photo must be a valid URL'),
    body('profilePhotoPublicId').optional({ checkFalsy: true }).trim(),
    validate
];

exports.loginValidation = [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    validate
];

exports.refreshTokenValidation = [
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
    validate
];

exports.updateProfileValidation = [
    body('firstName').optional({ checkFalsy: true }).trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
    body('lastName').optional({ checkFalsy: true }).trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
    body('username').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
    body('phoneNumber').optional({ checkFalsy: true }).trim().isMobilePhone('any').withMessage('Valid phone number is required'),
    body('about').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('About must be max 500 characters'),
    body('profilePhotoUrl').optional({ checkFalsy: true }).trim().isURL().withMessage('Profile photo must be a valid URL'),
    body('profilePhotoPublicId').optional({ checkFalsy: true }).trim(),
    validate
];

exports.changePasswordValidation = [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
        .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Must contain at least one number')
        .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Must contain at least one special character'),
    validate
];

exports.updateSettingsValidation = [
    body('privacy').optional().isObject().withMessage('Privacy must be an object'),
    body('privacy.lastSeen').optional().isIn(['everyone', 'contacts', 'nobody']).withMessage('Invalid lastSeen value'),
    body('privacy.profilePhoto').optional().isIn(['everyone', 'contacts', 'nobody']).withMessage('Invalid profilePhoto value'),
    body('privacy.about').optional().isIn(['everyone', 'contacts', 'nobody']).withMessage('Invalid about privacy value'),
    body('privacy.readReceipts').optional().isBoolean().withMessage('readReceipts must be boolean'),
    body('privacy.onlineStatus').optional().isIn(['everyone', 'contacts', 'nobody']).withMessage('Invalid onlineStatus value'),
    body('notifications').optional().isObject().withMessage('Notifications must be an object'),
    body('notifications.messageNotifications').optional().isBoolean(),
    body('notifications.showPreview').optional().isBoolean(),
    body('notifications.vibrate').optional().isBoolean(),
    body('notifications.groupNotifications').optional().isBoolean(),
    body('chat').optional().isObject().withMessage('Chat must be an object'),
    body('chat.theme').optional().isIn(['light', 'dark', 'system']).withMessage('Invalid theme value'),
    body('chat.fontSize').optional().isIn(['small', 'medium', 'large']).withMessage('Invalid fontSize value'),
    body('chat.enterToSend').optional().isBoolean(),
    body('account').optional().isObject().withMessage('Account must be an object'),
    body('account.language').optional().trim().isLength({ min: 2, max: 5 }).withMessage('Invalid language code'),
    validate
];

exports.uploadKeysValidation = [
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('registrationId').isNumeric().withMessage('Registration ID is required'),
    body('identityKey').notEmpty().withMessage('Identity Key is required'),
    body('signedPreKey.keyId').isNumeric().withMessage('Signed PreKey ID is required'),
    body('signedPreKey.publicKey').notEmpty().withMessage('Signed PreKey PublicKey is required'),
    body('signedPreKey.signature').notEmpty().withMessage('Signed PreKey Signature is required'),
    body('oneTimePreKeys').isArray().withMessage('OneTimePreKeys must be an array'),
    body('fcmToken').optional().trim(),
    body('deviceInfo').optional().isObject(),
    validate
];

exports.replenishKeysValidation = [
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('oneTimePreKeys').isArray().withMessage('OneTimePreKeys must be an array'),
    validate
];

exports.syncContactsValidation = [
    body('contacts').isArray({ min: 1 }).withMessage('Contacts must be a non-empty array'),
    body('contacts.*').isString().withMessage('Each contact must be a phone number string'),
    validate
];
