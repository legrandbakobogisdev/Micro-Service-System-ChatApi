const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['individual', 'group'],
        default: 'individual'
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    groupMetadata: {
        name: { type: String, trim: true },
        description: { type: String, trim: true },
        icon: String,
        creatorId: mongoose.Schema.Types.ObjectId,
        admins: [mongoose.Schema.Types.ObjectId]
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    unreadCounts: {
        type: Map,
        of: Number,
        default: {}
    },
    // Per-user mute (array of userIds who muted this conversation)
    mutedBy: [{
        type: mongoose.Schema.Types.ObjectId
    }],
    // Per-user archive (array of userIds who archived this conversation)
    archivedBy: [{
        type: mongoose.Schema.Types.ObjectId
    }],
    isDeleted: {
        type: Boolean,
        default: false
    },
    blockedBy: [{
        type: mongoose.Schema.Types.ObjectId
    }],
    pinnedBy: [{
        type: mongoose.Schema.Types.ObjectId
    }]
}, {
    timestamps: true,
    versionKey: false
});

// Compound index for individual chats uniqueness
ConversationSchema.index({ type: 1, participants: 1 }, { 
    unique: true, 
    partialFilterExpression: { type: 'individual' } 
});

module.exports = mongoose.model('Conversation', ConversationSchema);
