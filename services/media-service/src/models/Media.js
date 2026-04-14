const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['image', 'video', 'voice', 'document', 'other'],
        required: true
    },
    url: {
        type: String,
        required: true
    },
    publicId: {
        type: String,
        required: true,
        unique: true
    },
    fileName: String,
    fileSize: {
        type: Number, // in bytes
        required: true
    },
    mimeType: String,
    context: {
        type: String,
        enum: ['chat', 'story', 'profile', 'other'],
        default: 'chat'
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true // ID of the message or story
    },
    thumbnailUrl: String,
    blurhash: String,
    fileHash: {
        type: String,
        index: true
    },
    metadata: {
        width: Number,
        height: Number,
        duration: Number, // for video/voice
        format: String,
        resourceType: String,
        isEncrypted: {
            type: Boolean,
            default: false
        }
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    versionKey: false
});

// Index for fast lookup by publicId and userId
MediaSchema.index({ publicId: 1 });
MediaSchema.index({ userId: 1, context: 1 });

module.exports = mongoose.model('Media', MediaSchema);
