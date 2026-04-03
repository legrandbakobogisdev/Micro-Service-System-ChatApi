const { createLogger } = require('./logger');

class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation failed', errors = null) {
        super(message, 422);
        this.errors = errors;
    }
}

class AuthError extends AppError {
    constructor(message = 'Authentication failed') { super(message, 401); }
}

class ForbiddenError extends AppError {
    constructor(message = 'Access forbidden') { super(message, 403); }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') { super(message, 404); }
}

class ConflictError extends AppError {
    constructor(message = 'Resource conflict') { super(message, 409); }
}

class BadRequestError extends AppError {
    constructor(message = 'Bad request') { super(message, 400); }
}

function errorHandler(err, req, res, next) {
    const logger = createLogger(process.env.SERVICE_NAME || 'chatapp');
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';

    if (statusCode >= 500) {
        logger.error(`Error: ${message}`, { error: err, stack: err.stack, url: req.originalUrl, method: req.method, ip: req.ip });
    } else {
        logger.warn(`Client error: ${message}`, { url: req.originalUrl, method: req.method, ip: req.ip });
    }

    const response = { success: false, message, timestamp: new Date().toISOString() };
    if (err.errors) response.errors = err.errors;
    if (process.env.NODE_ENV === 'development') response.stack = err.stack;

    res.status(statusCode).json(response);
}

function notFoundHandler(req, res, next) {
    const error = new NotFoundError(`Route ${req.originalUrl} not found`);
    next(error);
}

function handleUnhandledRejection(logger) {
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection:', { reason, promise });
    });
}

function handleUncaughtException(logger) {
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
        process.exit(1);
    });
}

module.exports = {
    AppError, ValidationError, AuthError, ForbiddenError, NotFoundError, ConflictError, BadRequestError,
    errorHandler, notFoundHandler, handleUnhandledRejection, handleUncaughtException
};
