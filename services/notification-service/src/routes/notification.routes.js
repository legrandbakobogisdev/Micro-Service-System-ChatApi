const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { registerDeviceValidation, sendTestNotificationValidation } = require('../middlewares/validators');
const { authenticate } = require('../middlewares/auth');

// All notification routes go here
router.get('/health', notificationController.health);
router.get('/history', notificationController.getHistory);
router.post('/devices', registerDeviceValidation, notificationController.registerDevice);
router.post('/test', sendTestNotificationValidation, notificationController.sendTestNotification);
router.post('/actions', authenticate, notificationController.handleNotificationAction);

module.exports = router;
