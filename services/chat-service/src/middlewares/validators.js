const { body, query } = require('express-validator');
const { validate } = require('../../shared/utils/validator');

/**
 * Validator for initiating a conversation
 */
exports.initiateConversationValidation = [
    body('participantId')
        .notEmpty().withMessage('Participant ID is required')
        .isMongoId().withMessage('Invalid Participant ID format'),
    body('type')
        .optional()
        .isIn(['individual', 'group']).withMessage('Type must be individual or group'),
    validate
];

/**
 * Validator for group creation
 */
exports.createGroupValidation = [
    body('name')
        .notEmpty().withMessage('Group name is required')
        .trim()
        .isLength({ min: 1, max: 100 }).withMessage('Group name must be between 1 and 100 characters'),
    body('participants')
        .isArray({ min: 1 }).withMessage('At least one participant besides the creator is required')
        .custom((participants) => {
            if (participants.some(p => !/^[0-9a-fA-F]{24}$/.test(p))) {
                throw new Error('All participants must be valid MongoIDs');
            }
            return true;
        }),
    validate
];

/**
 * Validator for updating group metadata
 */
exports.updateGroupValidation = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 }).withMessage('Group name must be between 1 and 100 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Description must be at most 500 characters'),
    validate
];

/**
 * Validator for adding group members
 */
exports.addGroupMembersValidation = [
    body('members')
        .isArray({ min: 1 }).withMessage('At least one member is required')
        .custom((members) => {
            if (members.some(m => !/^[0-9a-fA-F]{24}$/.test(m))) {
                throw new Error('All members must be valid MongoIDs');
            }
            return true;
        }),
    validate
];

/**
 * Validator for sending a message
 */
exports.sendMessageValidation = [
    body('conversationId')
        .notEmpty().withMessage('Conversation ID is required')
        .isMongoId().withMessage('Invalid Conversation ID format'),
    body('content')
        .notEmpty().withMessage('Message content is required')
        .isString().withMessage('Message content must be a string'),
    body('type')
        .optional()
        .isIn(['text', 'image', 'video', 'voice', 'document', 'system']).withMessage('Invalid message type'),
    validate
];

/**
 * Validator for message status update
 */
exports.updateStatusValidation = [
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['delivered', 'read']).withMessage('Status must be delivered or read'),
    body('deviceId')
        .optional()
        .isString().withMessage('Device ID must be a string'),
    validate
];

/**
 * Validator for reactions
 */
exports.reactionValidation = [
    body('emoji')
        .notEmpty().withMessage('Emoji is required')
        .isString().withMessage('Emoji must be a string')
        .isLength({ min: 1, max: 10 }).withMessage('Emoji must be between 1 and 10 characters'),
    validate
];

/**
 * Validator for reporting
 */
exports.reportValidation = [
    body('reason')
        .notEmpty().withMessage('Reason is required')
        .isIn(['spam', 'abuse', 'harassment', 'inappropriate_content', 'impersonation', 'other']).withMessage('Invalid reason'),
    body('details')
        .optional()
        .trim()
        .isLength({ max: 1000 }).withMessage('Details must be at most 1000 characters'),
    validate
];

/**
 * Validator for updating a message
 */
exports.updateMessageValidation = [
    body('content')
        .notEmpty().withMessage('New content is required')
        .isString().withMessage('Content must be a string')
        .trim(),
    validate
];

/**
 * Validator for forwarding a message
 */
exports.forwardMessageValidation = [
    body('targetConversationId')
        .notEmpty().withMessage('Target conversation ID is required')
        .isMongoId().withMessage('Invalid target conversation ID format'),
    validate
];
