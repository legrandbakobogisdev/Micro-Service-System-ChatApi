const jwt = require('jsonwebtoken');
const { AuthError } = require('../../shared/utils/errorHandler');
const asyncHandler = require('../../shared/utils/asyncHandler');

exports.authenticate = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthError('No token provided');
    }

    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        // Important: we include isPremium in the user object
        req.user = { 
            id: decoded.userId, 
            role: decoded.role, 
            isPremium: decoded.isPremium || false 
        }; 
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') throw new AuthError('Invalid token');
        if (error.name === 'TokenExpiredError') throw new AuthError('Token expired');
        throw error;
    }
});
