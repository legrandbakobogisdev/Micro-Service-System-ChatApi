const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Report = require('../models/Report');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../../shared/utils/errorHandler');
const { getIO } = require('../socket');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('message-controller');

// ─────────────────────────────────────────
// MESSAGES CRUD + KAFKA (Feature 1)
// ─────────────────────────────────────────

/**
 * @desc Send a message
 * @route POST /api/chat/messages
 * @access Private
 */
exports.sendMessage = asyncHandler(async (req, res) => {
    const { conversationId, content, type = 'text', metadata = {}, replyTo } = req.body;
    const senderId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: senderId,
        isDeleted: false
    });

    if (!conversation) {
        throw new NotFoundError('Conversation not found or access denied');
    }

    if (conversation.blockedBy && conversation.blockedBy.length > 0) {
        throw new ValidationError('Conversation is blocked and cannot accept messages');
    }

    const message = await Message.create({
        conversationId,
        senderId,
        content,
        type,
        metadata,
        replyTo
    });

    // Update conversation
    conversation.lastMessage = message._id;
    conversation.participants.forEach(pId => {
        if (pId.toString() !== senderId.toString()) {
            const currentCount = conversation.unreadCounts.get(pId.toString()) || 0;
            conversation.unreadCounts.set(pId.toString(), currentCount + 1);
        }
    });
    await conversation.save();

    // Socket.io notifications
    const io = getIO();
    io.to(conversationId).emit('new_message', message);

    conversation.participants.forEach(pId => {
        if (pId.toString() !== senderId.toString()) {
            io.to(pId.toString()).emit('message_received', { message, conversationId });
        }
    });

    // Kafka — push notification for offline users (Feature 1)
    try {
        const producer = getProducer('chat-service');
        await producer.sendMessage(TOPICS.CHAT_MESSAGE_SENT, {
            messageId: message._id,
            conversationId,
            senderId,
            content: type === 'text' ? content : `[${type}]`,
            type,
            participants: conversation.participants.map(p => p.toString()).filter(p => p !== senderId.toString()),
            conversationType: conversation.type,
            groupName: conversation.groupMetadata?.name || null,
            mutedBy: conversation.mutedBy?.map(m => m.toString()) || []
        });
    } catch (err) {
        logger.warn('Failed to publish message.sent event:', err.message);
    }

    logger.debug(`Message sent in conversation: ${conversationId} by ${senderId}`);
    return ApiResponse.success(res, message, 'Message sent successfully', 201);
});

/**
 * @desc Get messages for a conversation
 * @route GET /api/chat/messages/:conversationId
 * @access Private
 */
exports.getMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { limit = 50, before, pagination = 'true' } = req.query;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        isDeleted: false
    });

    if (!conversation) {
        throw new NotFoundError('Conversation not found or access denied');
    }

    const query = { conversationId, isDeleted: false };
    if (before) {
        query.createdAt = { $lt: new Date(before) };
    }

    let messageQuery = Message.find(query).sort({ createdAt: -1 }).populate('replyTo');

    // Handle pagination
    if (pagination !== 'false') {
        messageQuery = messageQuery.limit(parseInt(limit));
    }

    const messages = await messageQuery;

    // Reset unread count for current user
    const unreadCount = conversation.unreadCounts.get(userId.toString()) || 0;
    if (unreadCount > 0) {
        conversation.unreadCounts.set(userId.toString(), 0);
        await conversation.save();
    }

    return ApiResponse.success(res, messages.reverse(), 'Messages retrieved successfully');
});

/**
 * @desc Update message content
 * @route PUT /api/chat/messages/:messageId
 * @access Private
 */
exports.updateMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    if (message.senderId.toString() !== userId) {
        throw new ForbiddenError('You can only edit your own messages');
    }

    if (message.isDeleted) {
        throw new ValidationError('Cannot edit a deleted message');
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    // Socket notification
    const io = getIO();
    io.to(message.conversationId.toString()).emit('message_updated', {
        messageId: message._id,
        conversationId: message.conversationId,
        content: message.content,
        isEdited: true,
        editedAt: message.editedAt
    });

    // Kafka event
    try {
        const producer = getProducer('chat-service');
        await producer.sendMessage(TOPICS.CHAT_MESSAGE_UPDATED, {
            messageId: message._id,
            conversationId: message.conversationId,
            content: message.content,
            senderId: message.senderId,
            editedAt: message.editedAt
        });
    } catch (err) {
        logger.warn('Failed to publish message.updated event:', err.message);
    }

    return ApiResponse.success(res, message, 'Message updated successfully');
});

/**
 * @desc Update message status (delivered, read) with multi-device tracking (Feature 8)
 * @route PATCH /api/chat/messages/:messageId/status
 * @access Private
 */
exports.updateMessageStatus = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { status, deviceId } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    // Multi-device tracking
    if (status === 'delivered') {
        const alreadyDelivered = message.deliveredTo.some(
            d => d.userId.toString() === userId && (!deviceId || d.deviceId === deviceId)
        );
        if (!alreadyDelivered) {
            message.deliveredTo.push({ userId, deviceId, at: new Date() });
        }

        // Kafka event
        try {
            const producer = getProducer('chat-service');
            await producer.sendMessage(TOPICS.CHAT_MESSAGE_DELIVERED, {
                messageId: message._id,
                conversationId: message.conversationId,
                deliveredTo: userId,
                deviceId
            });
        } catch (err) {
            logger.warn('Failed to publish message.delivered event:', err.message);
        }
    }

    if (status === 'read') {
        const alreadyRead = message.readBy.some(
            r => r.userId.toString() === userId && (!deviceId || r.deviceId === deviceId)
        );
        if (!alreadyRead) {
            message.readBy.push({ userId, deviceId, at: new Date() });
        }

        // Kafka event
        try {
            const producer = getProducer('chat-service');
            await producer.sendMessage(TOPICS.CHAT_MESSAGE_READ, {
                messageId: message._id,
                conversationId: message.conversationId,
                readBy: userId,
                deviceId
            });
        } catch (err) {
            logger.warn('Failed to publish message.read event:', err.message);
        }
    }

    // Update overall status
    const statusPriority = { 'sent': 1, 'delivered': 2, 'read': 3 };
    if (statusPriority[status] > statusPriority[message.status]) {
        message.status = status;
    }

    await message.save();

    // Notify the sender
    const io = getIO();
    io.to(message.senderId.toString()).emit('message_status_updated', {
        messageId: message._id,
        conversationId: message.conversationId,
        status,
        updatedBy: userId,
        deviceId
    });

    // Sync to all devices of the user who read (Feature 8)
    io.to(userId.toString()).emit('sync_message_status', {
        messageId: message._id,
        conversationId: message.conversationId,
        status,
        deviceId
    });

    return ApiResponse.success(res, message, 'Message status updated');
});

/**
 * @desc Mark all messages in a conversation as read by the user
 * @route PATCH /api/chat/messages/read-all/:conversationId
 * @access Private
 */
exports.markAllMessagesAsRead = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { deviceId } = req.body;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
        isDeleted: false
    });

    if (!conversation) {
        throw new NotFoundError('Conversation not found or access denied');
    }

    // 1. Update individual messages that haven't been read by this user
    // We only update status to 'read' for those where all recipients have now read (difficult to check in bulk)
    // Simplified: we add this user to the readBy array of messages in the conversation
    const now = new Date();
    await Message.updateMany(
        {
            conversationId,
            senderId: { $ne: userId }, // Don't mark your own messages as read by you
            'readBy.userId': { $ne: userId } // Only if not already read by this user
        },
        {
            $push: { readBy: { userId, deviceId, at: now } },
            $set: { status: 'read' } // Simplified: we mark the overall status as read too
        }
    );

    // 2. Reset unread count for the user on this conversation
    conversation.unreadCounts.set(userId.toString(), 0);
    await conversation.save();

    // 3. Emit Kafka event for other services (Feature sync)
    try {
        const producer = getProducer('chat-service');
        await producer.sendMessage(TOPICS.CHAT_MESSAGES_READ_ALL, {
            conversationId,
            userId,
            deviceId,
            readAt: now
        });
    } catch (err) {
        logger.warn('Failed to publish messages.read_all event:', err.message);
    }

    // 4. Socket sync via IO (Feature 8)
    const io = getIO();
    // Notify our our other devices
    io.to(userId.toString()).emit('sync_conversation_read', {
        conversationId,
        deviceId,
        readAt: now
    });
    // Notify other participants of this conversation - mapped to 'messages_read' for UI compat
    io.to(conversationId).emit('messages_read', {
        conversationId,
        readerId: userId,
        at: now
    });

    return ApiResponse.success(res, null, 'All messages marked as read');
});

/**
 * @desc Delete a message (soft-delete)
 * @route DELETE /api/chat/messages/:messageId
 * @access Private
 */
exports.deleteMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findOne({ _id: messageId, senderId: userId });
    if (!message) throw new NotFoundError('Message not found or you are not the sender');

    message.isDeleted = true;
    message.content = 'This message was deleted';
    await message.save();

    const io = getIO();
    io.to(message.conversationId.toString()).emit('message_deleted', {
        messageId: message._id,
        conversationId: message.conversationId,
        deletedBy: userId
    });

    // Kafka event
    try {
        const producer = getProducer('chat-service');
        await producer.sendMessage(TOPICS.CHAT_MESSAGE_DELETED, {
            messageId: message._id,
            conversationId: message.conversationId,
            deletedBy: userId
        });
    } catch (err) {
        logger.warn('Failed to publish message.deleted event:', err.message);
    }

    return ApiResponse.success(res, null, 'Message deleted');
});

/**
 * @desc Toggle pin status for a message
 * @route PATCH /api/chat/messages/:messageId/pin
 * @access Private
 */
exports.togglePinMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    const conversation = await Conversation.findOne({ _id: message.conversationId, participants: userId });
    if (!conversation) throw new ForbiddenError('You are not a participant in this conversation');

    message.isPinned = !message.isPinned;
    await message.save();

    const io = getIO();
    io.to(message.conversationId.toString()).emit('message_pinned_status', {
        messageId: message._id,
        conversationId: message.conversationId,
        isPinned: message.isPinned,
        pinnedBy: userId
    });

    return ApiResponse.success(res, message, message.isPinned ? 'Message pinned' : 'Message unpinned');
});

/**
 * @desc Get pinned messages for a conversation
 * @route GET /api/chat/messages/:conversationId/pinned
 * @access Private
 */
exports.getPinnedMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conversation) throw new NotFoundError('Conversation not found or access denied');

    const pinnedMessages = await Message.find({
        conversationId,
        isPinned: true,
        isDeleted: false
    }).sort({ updatedAt: -1 });

    return ApiResponse.success(res, pinnedMessages, 'Pinned messages retrieved');
});

// ─────────────────────────────────────────
// REACTIONS (Feature 4)
// ─────────────────────────────────────────

/**
 * @desc Add / Remove a reaction on a message
 * @route POST /api/chat/messages/:messageId/reactions
 * @access Private
 */
exports.toggleReaction = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    const conversation = await Conversation.findOne({ _id: message.conversationId, participants: userId });
    if (!conversation) throw new ForbiddenError('You are not a participant in this conversation');

    // Check if user already reacted with the same emoji
    const existingIndex = message.reactions.findIndex(
        r => r.userId.toString() === userId && r.emoji === emoji
    );

    if (existingIndex !== -1) {
        // Remove the reaction
        message.reactions.splice(existingIndex, 1);
    } else {
        message.reactions.push({ userId, emoji, createdAt: new Date() });
    }

    await message.save();

    const io = getIO();
    io.to(message.conversationId.toString()).emit('message_reaction_updated', {
        messageId: message._id,
        conversationId: message.conversationId,
        reactions: message.reactions,
        updatedBy: userId,
        emoji,
        action: existingIndex !== -1 ? 'removed' : 'added'
    });

    return ApiResponse.success(res, message.reactions, existingIndex !== -1 ? 'Reaction removed' : 'Reaction added');
});

// ─────────────────────────────────────────
// SEARCH (Feature 5)
// ─────────────────────────────────────────

/**
 * @desc Search messages in a conversation
 * @route GET /api/chat/messages/:conversationId/search
 * @access Private
 */
exports.searchMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { q, limit = 20, before } = req.query;
    const userId = req.user.id;

    if (!q || q.trim().length === 0) {
        throw new ValidationError('Search query is required');
    }

    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conversation) throw new NotFoundError('Conversation not found or access denied');

    const query = {
        conversationId,
        isDeleted: false,
        $text: { $search: q }
    };

    if (before) {
        query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(parseInt(limit));

    return ApiResponse.success(res, messages, `${messages.length} messages found`);
});

// ─────────────────────────────────────────
// REPORT (Feature 7)
// ─────────────────────────────────────────

/**
 * @desc Report a message
 * @route POST /api/chat/messages/:messageId/report
 * @access Private
 */
exports.reportMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { reason, details } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    const conversation = await Conversation.findOne({ _id: message.conversationId, participants: userId });
    if (!conversation) throw new ForbiddenError('You are not a participant in this conversation');

    // Prevent self-report
    if (message.senderId.toString() === userId) {
        throw new ValidationError('You cannot report your own message');
    }

    // Check for existing report
    const existing = await Report.findOne({ reporterId: userId, targetType: 'message', targetId: messageId });
    if (existing) {
        throw new ConflictError('You have already reported this message');
    }

    const report = await Report.create({
        reporterId: userId,
        targetType: 'message',
        targetId: messageId,
        conversationId: message.conversationId,
        messageId: message._id,
        reason,
        details
    });

    // Track on the message too
    message.reportedBy.push({ userId, reason, details, createdAt: new Date() });
    await message.save();

    logger.info(`Message ${messageId} reported by ${userId} for: ${reason}`);
    return ApiResponse.success(res, report, 'Message reported successfully', 201);
});

/**
 * @desc Report a user
 * @route POST /api/chat/reports/user/:targetUserId
 * @access Private
 */
exports.reportUser = asyncHandler(async (req, res) => {
    const { targetUserId } = req.params;
    const { reason, details, conversationId } = req.body;
    const userId = req.user.id;

    if (targetUserId === userId) {
        throw new ValidationError('You cannot report yourself');
    }

    const existing = await Report.findOne({ reporterId: userId, targetType: 'user', targetId: targetUserId });
    if (existing) {
        throw new ConflictError('You have already reported this user');
    }

    const report = await Report.create({
        reporterId: userId,
        targetType: 'user',
        targetId: targetUserId,
        conversationId,
        reason,
        details
    });

    logger.info(`User ${targetUserId} reported by ${userId} for: ${reason}`);
    return ApiResponse.success(res, report, 'User reported successfully', 201);
});

// ─────────────────────────────────────────
// FORWARD MESSAGE
// ─────────────────────────────────────────

/**
 * @desc Forward a message to another conversation
 * @route POST /api/chat/messages/:messageId/forward
 * @access Private
 */
exports.forwardMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { targetConversationId } = req.body;
    const userId = req.user.id;

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) throw new NotFoundError('Original message not found');

    // Check user is participant in source
    const sourceConv = await Conversation.findOne({ _id: originalMessage.conversationId, participants: userId });
    if (!sourceConv) throw new ForbiddenError('You are not a participant in the source conversation');

    // Check user is participant in target
    const targetConv = await Conversation.findOne({ _id: targetConversationId, participants: userId, isDeleted: false });
    if (!targetConv) throw new NotFoundError('Target conversation not found or access denied');

    if (targetConv.blockedBy && targetConv.blockedBy.length > 0) {
        throw new ValidationError('Target conversation is blocked');
    }

    const forwardedMessage = await Message.create({
        conversationId: targetConversationId,
        senderId: userId,
        content: originalMessage.content,
        type: originalMessage.type,
        metadata: originalMessage.metadata,
        isForwarded: true,
        forwardedFrom: originalMessage._id
    });

    // Update target conversation
    targetConv.lastMessage = forwardedMessage._id;
    targetConv.participants.forEach(pId => {
        if (pId.toString() !== userId.toString()) {
            const currentCount = targetConv.unreadCounts.get(pId.toString()) || 0;
            targetConv.unreadCounts.set(pId.toString(), currentCount + 1);
        }
    });
    await targetConv.save();

    const io = getIO();
    io.to(targetConversationId).emit('new_message', forwardedMessage);

    targetConv.participants.forEach(pId => {
        if (pId.toString() !== userId.toString()) {
            io.to(pId.toString()).emit('message_received', {
                message: forwardedMessage,
                conversationId: targetConversationId
            });
        }
    });

    // Kafka
    try {
        const producer = getProducer('chat-service');
        await producer.sendMessage(TOPICS.CHAT_MESSAGE_SENT, {
            messageId: forwardedMessage._id,
            conversationId: targetConversationId,
            senderId: userId,
            content: forwardedMessage.type === 'text' ? forwardedMessage.content : `[${forwardedMessage.type}]`,
            type: forwardedMessage.type,
            isForwarded: true,
            participants: targetConv.participants.map(p => p.toString()).filter(p => p !== userId.toString()),
            mutedBy: targetConv.mutedBy?.map(m => m.toString()) || []
        });
    } catch (err) {
        logger.warn('Failed to publish forwarded message event:', err.message);
    }

    return ApiResponse.success(res, forwardedMessage, 'Message forwarded successfully', 201);
});
