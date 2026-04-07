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
// Support both /api/chat/conversations/* and /api/chat/* for better front-end compatibility
router.post(['/conversations/initiate', '/initiate'], initiateConversationValidation, conversationController.initiateConversation);
router.get(['/conversations', '/'], conversationController.getConversations);
router.get(['/conversations/archived', '/archived'], conversationController.getArchivedConversations);

// Actions on conversation (ensure specific routes like /archived are above this generic one)
router.get(['/conversations/:conversationId', '/:conversationId'], conversationController.getConversationById);
router.patch(['/conversations/:conversationId/block', '/:conversationId/block'], conversationController.toggleBlockConversation);
router.patch(['/conversations/:conversationId/mute', '/:conversationId/mute'], conversationController.toggleMuteConversation);
router.patch(['/conversations/:conversationId/archive', '/:conversationId/archive'], conversationController.toggleArchiveConversation);
router.delete(['/conversations/:conversationId', '/:conversationId'], conversationController.deleteConversation);

// ── Groups ──
router.post('/groups', createGroupValidation, conversationController.createGroup);
router.put('/groups/:conversationId', updateGroupValidation, conversationController.updateGroup);
router.post('/groups/:conversationId/members', addGroupMembersValidation, conversationController.addGroupMembers);
router.delete('/groups/:conversationId/members/:memberId', conversationController.removeGroupMember);
router.post('/groups/:conversationId/leave', conversationController.leaveGroup);
router.patch('/groups/:conversationId/admins/:memberId', conversationController.toggleGroupAdmin);

module.exports = router;
