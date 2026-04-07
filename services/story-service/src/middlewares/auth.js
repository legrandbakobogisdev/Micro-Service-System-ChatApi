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
        // Decentralized auth: we trust the token content if signature is valid
        // In a more robust system, we might check Redis for blacklisted tokens or call auth-service
        req.user = { id: decoded.userId, role: decoded.role }; 
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') throw new AuthError('Invalid token');
        if (error.name === 'TokenExpiredError') throw new AuthError('Token expired');
        throw error;
    }
});
