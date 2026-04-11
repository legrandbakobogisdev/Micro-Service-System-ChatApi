const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const payunitController = require('../controllers/payunit.controller');
const { authenticate } = require('../middlewares/auth');

// Public Webhook route
router.post('/webhook/payunit', payunitController.handlePayunitWebhook);

// Protected routes
router.use(authenticate);
router.post('/initialize', paymentController.initializePayment);
router.get('/history', paymentController.getTransactionHistory);
router.get('/status/:transactionId', paymentController.getTransactionStatus);

module.exports = router;
