const paymentService = require('../services/paymentService');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');

/**
 * @desc    Initialize a payment transaction
 * @route   POST /api/payment/initialize
 * @access  Private
 */
exports.initializePayment = asyncHandler(async (req, res) => {
    const { amount, currency, returnUrl, return_url, notifyUrl, paymentCountry, metadata, provider } = req.body;
    const effectiveReturnUrl = returnUrl || return_url;

    const result = await paymentService.initializePayment({
        amount,
        currency,
        returnUrl: effectiveReturnUrl,
        notifyUrl,
        paymentCountry,
        userId: req.user.id,
        metadata,
        provider
    });

    return ApiResponse.created(res, result, 'Payment initialized successfully');
});

/**
 * @desc    Get transaction status
 * @route   GET /api/payment/status/:transactionId
 * @access  Private
 */
exports.getTransactionStatus = asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const transaction = await paymentService.getTransactionById(transactionId);
    return ApiResponse.success(res, transaction, 'Transaction status retrieved');
});
/**
 * @desc    Get user transaction history
 * @route   GET /api/payment/history
 * @access  Private
 */
exports.getTransactionHistory = asyncHandler(async (req, res) => {
    const transactions = await paymentService.getUserTransactions(req.user.id);
    return ApiResponse.success(res, transactions, 'Transaction history retrieved');
});
