const Subscription = require('../models/Subscription');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');

/**
 * @desc    Get current user's subscription status
 * @route   GET /api/subscription/status
 * @access  Private
 */
exports.getSubscriptionStatus = asyncHandler(async (req, res) => {
    let subscription = await Subscription.findOne({ userId: req.user.id });

    if (!subscription) {
        // Return default standard subscription if none found
        subscription = {
            userId: req.user.id,
            plan: 'standard',
            status: 'active'
        };
    }

    return ApiResponse.success(res, subscription, 'Subscription status retrieved');
});
