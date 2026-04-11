const jwt = require('jsonwebtoken');
const { AuthError, ForbiddenError } = require('../../shared/utils/errorHandler');
const asyncHandler = require('../../shared/utils/asyncHandler');

/**
 * Lightweight Auth Middleware for standalone services.
 * Verifies JWT and extracts user info without DB lookup.
 */
exports.authenticate = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new AuthError('No token provided');

    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        
        // In standalone services, we trust the decoded JWT data
        // We set req.user with info needed by the service
        req.user = {
            id: decoded.userId,
            userId: decoded.userId,
            role: decoded.role,
            email: decoded.email,
            isPremium: decoded.isPremium || false
        };
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') throw new AuthError('Invalid token');
        if (error.name === 'TokenExpiredError') throw new AuthError('Token expired');
        throw error;
    }
});

exports.authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) throw new AuthError('Authentication required');
        if (!allowedRoles.includes(req.user.role)) throw new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
        next();
    };
};
