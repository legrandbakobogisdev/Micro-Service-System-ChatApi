const { body } = require('express-validator');
const { validate } = require('../../shared/utils/validator');

/**
 * Validator for creating a new story
 */
exports.createStoryValidation = [
    body('type')
        .notEmpty().withMessage('Type is required')
        .isIn(['text', 'image', 'video', 'audio']).withMessage('Type must be text, image, video or audio'),
    body('content')
        .notEmpty().withMessage('Content is required'),
    body('mediaParams')
        .optional()
        .isObject().withMessage('mediaParams must be an object'),
    body('mediaParams.backgroundColor')
        .optional()
        .isString().withMessage('Background color must be a string'),
    validate
];
