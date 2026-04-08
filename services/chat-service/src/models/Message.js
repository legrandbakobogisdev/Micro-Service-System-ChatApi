const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Conversation'
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'voice', 'document', 'system'],
        default: 'text'
    },
    metadata: {
        fileName: String,
        fileSize: Number,
        mimeType: String,
        url: String,
        duration: Number // for voice/video
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent'
    },
    deliveredAt: Date,
    // Per-device/user delivery & read tracking for multi-device sync
    deliveredTo: [{
        userId: mongoose.Schema.Types.ObjectId,
        deviceId: String,
        at: { type: Date, default: Date.now }
    }],
    readBy: [{
        userId: mongoose.Schema.Types.ObjectId,
        deviceId: String,
        at: { type: Date, default: Date.now }
    }],
    reactions: [{
        userId: mongoose.Schema.Types.ObjectId,
        emoji: String,
        createdAt: { type: Date, default: Date.now }
    }],
    isForwarded: {
        type: Boolean,
        default: false
    },
    forwardedFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    editedAt: Date,
    isPinned: {
        type: Boolean,
        default: false
    },
    reportedBy: [{
        userId: mongoose.Schema.Types.ObjectId,
        reason: { type: String, enum: ['spam', 'abuse', 'inappropriate', 'other'] },
        details: String,
        createdAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true,
    versionKey: false
});

// Index for fast retrieval of messages in a conversation
MessageSchema.index({ conversationId: 1, createdAt: -1 });

// Text index for search
MessageSchema.index({ content: 'text' });

module.exports = mongoose.model('Message', MessageSchema);
