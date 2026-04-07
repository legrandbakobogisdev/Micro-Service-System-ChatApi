const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    reporterId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    targetType: {
        type: String,
        enum: ['message', 'user', 'conversation'],
        required: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    // Additional context
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation'
    },
    messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    reason: {
        type: String,
        enum: ['spam', 'abuse', 'harassment', 'inappropriate_content', 'impersonation', 'other'],
        required: true
    },
    details: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    status: {
        type: String,
        enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
        default: 'pending'
    },
    resolvedBy: mongoose.Schema.Types.ObjectId,
    resolvedAt: Date,
    resolution: String
}, {
    timestamps: true,
    versionKey: false
});

// Prevent duplicate reports from the same user on the same target
ReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model('Report', ReportSchema);
