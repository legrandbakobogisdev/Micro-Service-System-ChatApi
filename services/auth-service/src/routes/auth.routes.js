const express = require('express');
const authController = require('../controllers/authController');
const keyController = require('../controllers/keyController');
const { authenticate } = require('../middlewares/auth');
const {
    registerValidation,
    loginValidation,
    refreshTokenValidation,
    requestOTPValidation,
    verifyOTPValidation,
    updateProfileValidation,
    updateSettingsValidation,
    uploadKeysValidation,
    replenishKeysValidation,
    syncContactsValidation
} = require('../middlewares/validators');

const router = express.Router();

// Public routes
router.post('/request-otp', requestOTPValidation, authController.requestOTP);
router.post('/verify-otp', verifyOTPValidation, authController.verifyOTP);
router.post('/register', registerValidation, authController.register);
router.post('/refresh', refreshTokenValidation, authController.refreshToken);

// Protected routes
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, updateProfileValidation, authController.updateProfile);
router.post('/contacts/sync', authenticate, syncContactsValidation, authController.syncContacts);

// Settings routes (WhatsApp-like)
router.put('/settings', authenticate, updateSettingsValidation, authController.updateSettings);
router.get('/settings/blocked-users', authenticate, authController.getBlockedUsers);
router.post('/settings/block/:targetUserId', authenticate, authController.toggleBlockUser);

// User retrieval
router.get('/users/:userId', authenticate, authController.getUser);
router.patch('/users/:userId/last-seen', authController.updateLastSeen);

// E2EE Keys & Device routes
router.post('/keys', authenticate, uploadKeysValidation, keyController.uploadKeys);
router.get('/keys/:userId', authenticate, keyController.getKeys);
router.post('/keys/replenish', authenticate, replenishKeysValidation, keyController.replenishKeys);

module.exports = router;
