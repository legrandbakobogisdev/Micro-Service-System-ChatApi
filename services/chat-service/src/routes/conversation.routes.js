const express = require('express');
const conversationController = require('../controllers/conversationController');
const { authenticate } = require('../middlewares/auth');
const { 
    initiateConversationValidation, 
    createGroupValidation,
    updateGroupValidation,
    addGroupMembersValidation
} = require('../middlewares/validators');

const router = express.Router();

// All chat routes are protected
router.use(authenticate);

// ── Conversations ──
// Specific routes FIRST to avoid conflicts with generic /:conversationId
router.post(['/conversations/initiate', '/initiate'], initiateConversationValidation, conversationController.initiateConversation);
router.get(['/conversations/archived', '/archived'], conversationController.getArchivedConversations);

// ── Groups (specific routes before generic) ──
router.post('/groups', createGroupValidation, conversationController.createGroup);
router.put('/groups/:conversationId', updateGroupValidation, conversationController.updateGroup);
router.post('/groups/:conversationId/members', addGroupMembersValidation, conversationController.addGroupMembers);
router.delete('/groups/:conversationId/members/:memberId', conversationController.removeGroupMember);
router.post('/groups/:conversationId/leave', conversationController.leaveGroup);
router.patch('/groups/:conversationId/admins/:memberId', conversationController.toggleGroupAdmin);

// ── Generic conversation routes (AFTER specific ones) ──
router.get(['/conversations', '/'], conversationController.getConversations);
router.get(['/conversations/:conversationId/members', '/:conversationId/members'], conversationController.getConversationMembers);
router.get(['/conversations/:conversationId', '/:conversationId'], conversationController.getConversationById);
router.patch(['/conversations/:conversationId/block', '/:conversationId/block'], conversationController.toggleBlockConversation);
router.patch(['/conversations/:conversationId/mute', '/:conversationId/mute'], conversationController.toggleMuteConversation);
router.patch(['/conversations/:conversationId/archive', '/:conversationId/archive'], conversationController.toggleArchiveConversation);
router.patch(['/conversations/:conversationId/pin', '/:conversationId/pin'], conversationController.togglePinConversation);
router.delete(['/conversations/:conversationId', '/:conversationId'], conversationController.deleteConversation);

module.exports = router;
