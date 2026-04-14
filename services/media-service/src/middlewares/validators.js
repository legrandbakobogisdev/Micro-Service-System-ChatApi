const { body, validationResult } = require('express-validator');
const ApiResponse = require('../../shared/utils/response');

const validate = (validations) => {
    return async (req, res, next) => {
        for (let validation of validations) {
            const result = await validation.run(req);
            if (result.errors.length) break;
        }

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        return ApiResponse.error(res, 'Validation failed', 400, errors.array());
    };
};

const uploadValidator = [
    body('context').optional().isIn(['chat', 'story', 'profile', 'other']).withMessage('Invalid context'),
    body('ownerId').optional().isMongoId().withMessage('Invalid ownerId format'),
    body('isEncrypted').optional().isBoolean().withMessage('isEncrypted must be a boolean'),
    body('fileHash').optional().isString().withMessage('fileHash must be a string'),
    body('blurhash').optional().isString().withMessage('blurhash must be a string'),
    body('customThumbnailUrl').optional().isURL().withMessage('customThumbnailUrl must be a valid URL')
];

module.exports = {
    validate,
    uploadValidator
};
