const { validationResult } = require('express-validator');
const { ValidationError } = require('./errorHandler');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map(err => ({
            field: err.param,
            message: err.msg,
            value: err.value
        }));
        throw new ValidationError('Validation failed', formattedErrors);
    }
    next();
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPassword = (password) => {
    if (password.length < 8) return { isValid: false, message: 'Password must be at least 8 characters long' };
    if (!/[A-Z]/.test(password)) return { isValid: false, message: 'Must contain at least one uppercase letter' };
    if (!/[a-z]/.test(password)) return { isValid: false, message: 'Must contain at least one lowercase letter' };
    if (!/[0-9]/.test(password)) return { isValid: false, message: 'Must contain at least one number' };
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return { isValid: false, message: 'Must contain at least one special character' };
    return { isValid: true, message: 'Password is valid' };
};

const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/[<>]/g, '');
};

module.exports = { validate, isValidEmail, isValidPassword, sanitizeString };
