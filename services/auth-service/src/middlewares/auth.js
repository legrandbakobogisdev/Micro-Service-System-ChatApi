const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AuthError, ForbiddenError } = require('../../../../shared/utils/errorHandler');
const asyncHandler = require('../../../../shared/utils/asyncHandler');

exports.authenticate = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new AuthError('No token provided');

    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) throw new AuthError('Invalid token or user not found');
        req.user = user.toSafeObject();
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

exports.optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            const user = await User.findById(decoded.userId);
            if (user && user.isActive) req.user = user.toSafeObject();
        }
    } catch (error) { /* Ignore for optional auth */ }
    next();
};
