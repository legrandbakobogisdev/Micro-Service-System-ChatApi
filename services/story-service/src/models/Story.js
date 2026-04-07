const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'audio'],
        required: true
    },
    content: {
        // Can be text body or media URL
        type: String,
        required: true
    },
    mediaParams: {
        // For images/videos (e.g. background color for text, duration for video, etc.)
        backgroundColor: String,
        fontStyle: String,
        duration: Number
    },
    expiresAt: {
        type: Date,
        required: true
    },
    viewCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true,
    versionKey: false
});

// TTL Index to automatically delete stories after 24 hours
// By setting expireAfterSeconds to 0, MongoDB will delete the document when the current time reaches `expiresAt`
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Story', StorySchema);
