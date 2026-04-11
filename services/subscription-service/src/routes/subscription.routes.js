const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/status', subscriptionController.getSubscriptionStatus);

module.exports = router;
