const paymentService = require('../services/paymentService');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('payment-service:payunit-controller');

/**
 * @desc    PayUnit webhook notification handler
 * @route   POST /api/payment/webhook/payunit
 * @access  Public
 */
exports.handlePayunitWebhook = asyncHandler(async (req, res) => {
    logger.info('PayUnit webhook received', { body: req.body });

    const result = await paymentService.handleWebhookNotification('payunit', req.body);

    // Always return 200 to PayUnit
    return ApiResponse.success(res, result, 'Webhook processed');
});
