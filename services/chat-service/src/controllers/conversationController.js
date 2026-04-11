const Conversation = require('../models/Conversation');
const User = require('../models/User');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../shared/utils/errorHandler');
const { getIO } = require('../socket');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('chat-service');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

/**
 * Helper to ensure users are cached in chat-service.
 * Useful for data migration or when Kafka events were missed.
 */
async function syncUsers(userIds, token) {
    if (!userIds || userIds.length === 0) return;
    
    // Find which users are missing from cache
    const existingUsers = await User.find({ _id: { $in: userIds } });
    const existingIds = existingUsers.map(u => u._id.toString());
    const missingIds = userIds.filter(id => !existingIds.includes(id.toString()));
    
    if (missingIds.length === 0) return;
    
    logger.info(`Lazy-syncing ${missingIds.length} missing users from auth-service`);
    
    for (const id of missingIds) {
        try {
            const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/users/${id}`, {
                headers: { 'Authorization': token }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    const userData = result.data;
                    await User.findByIdAndUpdate(id, {
                        username: userData.username,
                        firstName: userData.firstName,
                        lastName: userData.lastName,
                        profilePhotoUrl: userData.profilePhotoUrl,
                        isPremium: userData.isPremium || false
                    }, { upsert: true });
                }
            }
        } catch (err) {
            logger.warn(`Failed to lazy-sync user ${id}: ${err.message}`);
        }
    }
}
/**
 * @desc Initiate a conversation
 * @route POST /api/chat/conversations/initiate
 * @access Private
 */
exports.initiateConversation = asyncHandler(async (req, res) => {
    const { participantId, type = 'individual' } = req.body;
    const currentUserId = req.user.id;

    if (currentUserId === participantId) {
        throw new ValidationError('You cannot start a conversation with yourself');
    }

    if (type === 'individual') {
        const sortedParticipants = [currentUserId, participantId].sort();

        let conversation = await Conversation.findOne({
            type: 'individual',
            participants: { $all: sortedParticipants, $size: 2 }
        });

        if (conversation) {
            // Ensure participants are populated
            await syncUsers(sortedParticipants, req.headers.authorization);
            await conversation.populate('participants', 'username firstName lastName profilePhotoUrl isPremium');
            return ApiResponse.success(res, conversation, 'Conversation already exists');
        }

        // Ensure both users exist in chat-service cache before creating
        await syncUsers(sortedParticipants, req.headers.authorization);

        conversation = await Conversation.create({
            type: 'individual',
            participants: sortedParticipants
        });
        
        await conversation.populate('participants', 'username firstName lastName profilePhotoUrl isPremium');

        logger.info(`New conversation created between ${currentUserId} and ${participantId}`);
        return ApiResponse.success(res, conversation, 'Conversation initiated successfully', 201);
    } else {
        throw new ValidationError('Use /groups endpoint for group conversations');
    }
});

/**
 * @desc Get all conversations for current user
 * @route GET /api/chat/conversations
 * @access Private
 */
exports.getConversations = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { archived, pagination = 'true' } = req.query;

    const query = {
        participants: userId,
        isDeleted: false
    };

    // Filter archived / non-archived
    if (archived === 'true') {
        query.archivedBy = userId;
    } else {
        query.archivedBy = { $ne: userId };
    }

    let conversationQuery = Conversation.find(query)
        .sort({ updatedAt: -1 })
        .populate('lastMessage')
        .populate('participants', 'username firstName lastName profilePhotoUrl isPremium');

    // Handle pagination (if disabled, return all)
    if (pagination !== 'false') {
        const { limit = 50, page = 1 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        conversationQuery = conversationQuery.skip(skip).limit(parseInt(limit));
    }

    const conversations = await conversationQuery;

    // Detect if populate failed (Mongoose strips unknown refs, leaving fewer participants)
    // We need the raw IDs to compare
    const rawConversations = await Conversation.find(query).select('participants').lean();
    const rawParticipantMap = {};
    for (const rc of rawConversations) {
        rawParticipantMap[rc._id.toString()] = rc.participants.map(p => p.toString());
    }
    
    // Check if any conversation has fewer populated participants than raw
    const someFailed = conversations.some(c => {
        const raw = rawParticipantMap[c._id.toString()] || [];
        return c.participants.length < raw.length;
    });
    
    if (someFailed) {
        // Collect all raw participant IDs that need syncing
        const allRawIds = [...new Set(Object.values(rawParticipantMap).flat())];
        await syncUsers(allRawIds, req.headers.authorization);
        // Re-populate all conversations in the list
        for (const conv of conversations) {
            await conv.populate('participants', 'username firstName lastName profilePhotoUrl isPremium');
        }
    }

    return ApiResponse.success(res, conversations, 'Conversations retrieved successfully');
});

/**
 * @desc Get all archived conversations for current user
 * @route GET /api/chat/conversations/archived
 * @access Private
 */
exports.getArchivedConversations = asyncHandler(async (req, res, next) => {
    req.query.archived = 'true';
    return exports.getConversations(req, res, next);
});

/**
 * @desc Get single conversation details
 * @route GET /api/chat/conversations/:conversationId
 * @access Private
 */
exports.getConversationById = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        isDeleted: false
    })
    .populate('lastMessage')
    .populate('participants', 'username firstName lastName profilePhotoUrl isPremium');

    if (!conversation) {
        throw new NotFoundError('Conversation not found or access denied');
    }

    // Detect if populate stripped missing users (raw has more participants than populated)
    const rawConv = await Conversation.findById(conversationId).select('participants').lean();
    if (rawConv && conversation.participants.length < rawConv.participants.length) {
        const rawIds = rawConv.participants.map(p => p.toString());
        await syncUsers(rawIds, req.headers.authorization);
        // Re-populate
        await conversation.populate('participants', 'username firstName lastName profilePhotoUrl isPremium');
    }

    return ApiResponse.success(res, conversation, 'Conversation details retrieved successfully');
});

/**
 * @desc Toggle block status for a conversation
 * @route PATCH /api/chat/conversations/:conversationId/block
 * @access Private
 */
exports.toggleBlockConversation = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId
    });

    if (!conversation) {
        throw new NotFoundError('Conversation not found');
    }

    const blockedIndex = conversation.blockedBy.indexOf(userId);
    if (blockedIndex === -1) {
        conversation.blockedBy.push(userId);
    } else {
        conversation.blockedBy.splice(blockedIndex, 1);
    }

    await conversation.save();

    const io = getIO();
    conversation.participants.forEach(pId => {
        io.to(pId.toString()).emit('conversation_block_status', {
            conversationId,
            blockedBy: conversation.blockedBy,
            status: conversation.blockedBy.includes(userId) ? 'blocked' : 'unblocked'
        });
    });

    return ApiResponse.success(res, conversation, conversation.blockedBy.includes(userId) ? 'Conversation blocked' : 'Conversation unblocked');
});

/**
 * @desc Delete (Soft-delete) a conversation
 * @route DELETE /api/chat/conversations/:conversationId
 * @access Private
 */
exports.deleteConversation = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOneAndUpdate(
        { _id: conversationId, participants: userId },
        { isDeleted: true },
        { new: true }
    );

    if (!conversation) {
        throw new NotFoundError('Conversation not found');
    }

    return ApiResponse.success(res, null, 'Conversation deleted successfully');
});

// ─────────────────────────────────────────
// MUTE & ARCHIVE (Feature 6)
// ─────────────────────────────────────────

/**
 * @desc Toggle mute for a conversation
 * @route PATCH /api/chat/conversations/:conversationId/mute
 * @access Private
 */
exports.toggleMuteConversation = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId
    });

    if (!conversation) {
        throw new NotFoundError('Conversation not found');
    }

    const mutedIndex = conversation.mutedBy.indexOf(userId);
    const isMuted = mutedIndex === -1;

    if (isMuted) {
        conversation.mutedBy.push(userId);
    } else {
        conversation.mutedBy.splice(mutedIndex, 1);
    }

    await conversation.save();

    const io = getIO();
    io.to(userId.toString()).emit('conversation_mute_status', {
        conversationId,
        isMuted
    });

    return ApiResponse.success(res, { isMuted }, isMuted ? 'Conversation muted' : 'Conversation unmuted');
});

/**
 * @desc Toggle archive for a conversation
 * @route PATCH /api/chat/conversations/:conversationId/archive
 * @access Private
 */
exports.toggleArchiveConversation = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId
    });

    if (!conversation) {
        throw new NotFoundError('Conversation not found');
    }

    const archivedIndex = conversation.archivedBy.indexOf(userId);
    const isArchived = archivedIndex === -1;

    if (isArchived) {
        conversation.archivedBy.push(userId);
    } else {
        conversation.archivedBy.splice(archivedIndex, 1);
    }

    await conversation.save();

    const io = getIO();
    io.to(userId.toString()).emit('conversation_archive_status', {
        conversationId,
        isArchived
    });

    return ApiResponse.success(res, { isArchived }, isArchived ? 'Conversation archived' : 'Conversation unarchived');
});

// ─────────────────────────────────────────
// GROUP MANAGEMENT (Feature 3)
// ─────────────────────────────────────────

/**
 * @desc Create a group
 * @route POST /api/chat/conversations/groups
 * @access Private
 */
exports.createGroup = asyncHandler(async (req, res) => {
    const { name, participants, description, icon } = req.body;
    const currentUserId = req.user.id;

    const allParticipants = [...new Set([...participants, currentUserId])];

    const group = await Conversation.create({
        type: 'group',
        participants: allParticipants,
        groupMetadata: {
            name,
            description,
            icon,
            creatorId: currentUserId,
            admins: [currentUserId]
        }
    });

    await group.populate('participants', 'username firstName lastName profilePhotoUrl isPremium');

    // Kafka event
    try {
        const producer = getProducer('chat-service');
        await producer.sendMessage(TOPICS.CHAT_GROUP_CREATED, {
            groupId: group._id,
            name,
            creatorId: currentUserId,
            participants: allParticipants
        });
    } catch (err) {
        logger.warn('Failed to publish group.created event:', err.message);
    }

    // Notify all participants
    const io = getIO();
    allParticipants.forEach(pId => {
        io.to(pId.toString()).emit('group_created', group);
    });

    logger.info(`Group "${name}" created by ${currentUserId}`);
    return ApiResponse.success(res, group, 'Group created successfully', 201);
});

/**
 * @desc Update group metadata (name, description, icon)
 * @route PUT /api/chat/conversations/groups/:conversationId
 * @access Private (Admin only)
 */
exports.updateGroup = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { name, description, icon } = req.body;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        type: 'group',
        participants: userId
    });

    if (!conversation) {
        throw new NotFoundError('Group not found');
    }

    // Only admin or creator can update group info
    const isAdmin = conversation.groupMetadata.admins.some(id => id.toString() === userId);
    if (!isAdmin) {
        throw new ForbiddenError('Only group admins can update group info');
    }

    if (name) conversation.groupMetadata.name = name;
    if (description !== undefined) conversation.groupMetadata.description = description;
    if (icon !== undefined) conversation.groupMetadata.icon = icon;

    await conversation.save();
    await conversation.populate('participants', 'username firstName lastName profilePhotoUrl isPremium');

    // Kafka event
    try {
        const producer = getProducer('chat-service');
        await producer.sendMessage(TOPICS.CHAT_GROUP_UPDATED, {
            groupId: conversationId,
            updatedBy: userId,
            changes: { name, description, icon }
        });
    } catch (err) {
        logger.warn('Failed to publish group.updated event:', err.message);
    }

    // Notify
    const io = getIO();
    io.to(conversationId).emit('group_updated', {
        conversationId,
        groupMetadata: conversation.groupMetadata,
        updatedBy: userId
    });

    return ApiResponse.success(res, conversation, 'Group updated successfully');
});

/**
 * @desc Add members to a group
 * @route POST /api/chat/conversations/groups/:conversationId/members
 * @access Private (Admin only)
 */
exports.addGroupMembers = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { members } = req.body; // array of userIds
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        type: 'group',
        participants: userId
    });

    if (!conversation) {
        throw new NotFoundError('Group not found');
    }

    const isAdmin = conversation.groupMetadata.admins.some(id => id.toString() === userId);
    if (!isAdmin) {
        throw new ForbiddenError('Only group admins can add members');
    }

    const newMembers = members.filter(m => !conversation.participants.some(p => p.toString() === m));
    if (newMembers.length === 0) {
        return ApiResponse.success(res, conversation, 'All members are already in the group');
    }

    conversation.participants.push(...newMembers);
    await conversation.save();
    await conversation.populate('participants', 'username firstName lastName profilePhotoUrl isPremium');

    const io = getIO();
    // Notify existing members
    io.to(conversationId).emit('group_members_added', {
        conversationId,
        addedMembers: newMembers,
        addedBy: userId
    });

    // Notify new members
    newMembers.forEach(memberId => {
        io.to(memberId.toString()).emit('added_to_group', {
            conversationId,
            group: conversation,
            addedBy: userId
        });
    });

    return ApiResponse.success(res, conversation, 'Members added successfully');
});

/**
 * @desc Remove a member from a group
 * @route DELETE /api/chat/conversations/groups/:conversationId/members/:memberId
 * @access Private (Admin only)
 */
exports.removeGroupMember = asyncHandler(async (req, res) => {
    const { conversationId, memberId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        type: 'group',
        participants: userId
    });

    if (!conversation) {
        throw new NotFoundError('Group not found');
    }

    const isAdmin = conversation.groupMetadata.admins.some(id => id.toString() === userId);
    const isCreator = conversation.groupMetadata.creatorId.toString() === userId;

    if (!isAdmin) {
        throw new ForbiddenError('Only group admins can remove members');
    }

    // Cannot remove creator
    if (memberId === conversation.groupMetadata.creatorId.toString()) {
        throw new ForbiddenError('Cannot remove the group creator');
    }

    // Admin can only be removed by the creator
    const targetIsAdmin = conversation.groupMetadata.admins.some(id => id.toString() === memberId);
    if (targetIsAdmin && !isCreator) {
        throw new ForbiddenError('Only the group creator can remove an admin');
    }

    // Remove from participants
    conversation.participants = conversation.participants.filter(p => p.toString() !== memberId);
    // Remove from admins if applicable
    conversation.groupMetadata.admins = conversation.groupMetadata.admins.filter(a => a.toString() !== memberId);

    await conversation.save();

    const io = getIO();
    io.to(conversationId).emit('group_member_removed', {
        conversationId,
        removedMember: memberId,
        removedBy: userId
    });

    io.to(memberId.toString()).emit('removed_from_group', {
        conversationId,
        removedBy: userId
    });

    return ApiResponse.success(res, conversation, 'Member removed successfully');
});

/**
 * @desc Leave a group
 * @route POST /api/chat/conversations/groups/:conversationId/leave
 * @access Private
 */
exports.leaveGroup = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        type: 'group',
        participants: userId
    });

    if (!conversation) {
        throw new NotFoundError('Group not found');
    }

    // Creator cannot leave — must transfer ownership first or delete group
    if (conversation.groupMetadata.creatorId.toString() === userId) {
        throw new ForbiddenError('Group creator cannot leave. Transfer ownership or delete the group.');
    }

    conversation.participants = conversation.participants.filter(p => p.toString() !== userId);
    conversation.groupMetadata.admins = conversation.groupMetadata.admins.filter(a => a.toString() !== userId);

    await conversation.save();

    const io = getIO();
    io.to(conversationId).emit('group_member_left', {
        conversationId,
        memberId: userId
    });

    return ApiResponse.success(res, null, 'You have left the group');
});

/**
 * @desc Promote / Demote a member to/from admin
 * @route PATCH /api/chat/conversations/groups/:conversationId/admins/:memberId
 * @access Private (Creator only)
 */
exports.toggleGroupAdmin = asyncHandler(async (req, res) => {
    const { conversationId, memberId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        type: 'group',
        participants: userId
    });

    if (!conversation) {
        throw new NotFoundError('Group not found');
    }

    // Only creator can promote/demote admins
    if (conversation.groupMetadata.creatorId.toString() !== userId) {
        throw new ForbiddenError('Only the group creator can manage admins');
    }

    // Check if member exists in group
    if (!conversation.participants.some(p => p.toString() === memberId)) {
        throw new NotFoundError('User is not a member of this group');
    }

    const adminIndex = conversation.groupMetadata.admins.findIndex(a => a.toString() === memberId);
    const isPromoted = adminIndex === -1;

    if (isPromoted) {
        conversation.groupMetadata.admins.push(memberId);
    } else {
        conversation.groupMetadata.admins.splice(adminIndex, 1);
    }

    await conversation.save();

    const io = getIO();
    io.to(conversationId).emit('group_admin_changed', {
        conversationId,
        memberId,
        isAdmin: isPromoted,
        changedBy: userId
    });

    io.to(memberId.toString()).emit('admin_status_changed', {
        conversationId,
        isAdmin: isPromoted
    });

    return ApiResponse.success(res, conversation, isPromoted ? 'Member promoted to admin' : 'Admin demoted to member');
});
