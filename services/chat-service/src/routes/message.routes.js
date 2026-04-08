const express = require('express');
const messageController = require('../controllers/messageController');
const { authenticate } = require('../middlewares/auth');
const { 
    sendMessageValidation, 
    updateMessageValidation,
    updateStatusValidation,
    reactionValidation,
    reportValidation,
    forwardMessageValidation
} = require('../middlewares/validators');

const router = express.Router();

router.use(authenticate);

// ── CRUD ──
router.post('/', sendMessageValidation, messageController.sendMessage);

// ── Pin (specific routes BEFORE generic ones) ──
router.patch('/:messageId/pin', messageController.togglePinMessage);
router.get('/:conversationId/pinned', messageController.getPinnedMessages);

// ── Reactions (Feature 4) ──
router.post('/:messageId/reactions', reactionValidation, messageController.toggleReaction);

// ── Search (Feature 5) ──
router.get('/:conversationId/search', messageController.searchMessages);

// ── Report (Feature 7) ──
router.post('/:messageId/report', reportValidation, messageController.reportMessage);

// ── Forward ──
router.post('/:messageId/forward', forwardMessageValidation, messageController.forwardMessage);

// ── Report User ──
router.post('/reports/user/:targetUserId', reportValidation, messageController.reportUser);

// ── Generic message routes (AFTER specific ones) ──
router.get('/:conversationId', messageController.getMessages);
router.put('/:messageId', updateMessageValidation, messageController.updateMessage);
router.patch('/read-all/:conversationId', messageController.markAllMessagesAsRead);
router.patch('/:messageId/status', updateStatusValidation, messageController.updateMessageStatus);
router.delete('/:messageId', messageController.deleteMessage);

module.exports = router;
