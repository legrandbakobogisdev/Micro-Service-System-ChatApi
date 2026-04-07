const User = require('../models/User');
const { registerPhoneInRedis } = require('../config/redis');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('auth-service');

/**
 * Sync all registered phone numbers to Redis for O(1) contact sync lookups
 */
const syncPhonesToRedis = async () => {
    try {
        logger.info('Syncing registered phone numbers to Redis...');
        
        // Find all users with a phone number
        const users = await User.find({ phoneNumber: { $exists: true, $ne: null } }).select('phoneNumber _id');
        
        if (users.length === 0) {
            logger.info('No phone numbers to sync');
            return;
        }

        let syncCount = 0;
        for (const user of users) {
            await registerPhoneInRedis(user.phoneNumber, user._id);
            syncCount++;
        }

        logger.info(`Successfully synced ${syncCount} phone numbers to Redis`);
    } catch (error) {
        logger.error('Failed to sync phone numbers to Redis:', error);
    }
};

module.exports = { syncPhonesToRedis };
