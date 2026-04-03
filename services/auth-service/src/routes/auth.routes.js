const express = require('express');
const authController = require('../controllers/authController');
const keyController = require('../controllers/keyController');
const { authenticate } = require('../middlewares/auth');
const {
    registerValidation,
    loginValidation,
    refreshTokenValidation,
    updateProfileValidation,
    changePasswordValidation,
    updateSettingsValidation,
    uploadKeysValidation,
    replenishKeysValidation
} = require('../middlewares/validators');

const router = express.Router();

// Public routes
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);
router.post('/refresh', refreshTokenValidation, authController.refreshToken);

// Protected routes
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, updateProfileValidation, authController.updateProfile);
router.put('/change-password', authenticate, changePasswordValidation, authController.changePassword);

// Settings routes (WhatsApp-like)
router.put('/settings', authenticate, updateSettingsValidation, authController.updateSettings);
router.post('/settings/block/:targetUserId', authenticate, authController.toggleBlockUser);

// User retrieval
router.get('/users/:userId', authenticate, authController.getUser);
router.patch('/users/:userId/last-seen', authController.updateLastSeen);

// E2EE Keys & Device routes
router.post('/keys', authenticate, uploadKeysValidation, keyController.uploadKeys);
router.get('/keys/:userId', authenticate, keyController.getKeys);
router.post('/keys/replenish', authenticate, replenishKeysValidation, keyController.replenishKeys);

module.exports = router;
