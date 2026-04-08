const { createLogger } = require('../../shared/utils/logger');
const { UnauthorizedError } = require('../../shared/utils/errorHandler');

const logger = createLogger('auth-middleware');

/**
 * Authenticate user from headers or JWT token
 */
exports.authenticate = (req, res, next) => {
    try {
        // Get user ID from headers (x-user-id) or from JWT in Authorization header
        const userId = req.headers['x-user-id'] || req.user?.id;
        
        if (!userId) {
            throw new UnauthorizedError('User ID not found in headers or token');
        }

        req.user = { id: userId };
        next();
    } catch (err) {
        logger.warn('Authentication failed:', err.message);
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};
