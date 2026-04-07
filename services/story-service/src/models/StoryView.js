const mongoose = require('mongoose');

const StoryViewSchema = new mongoose.Schema({
    storyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
        required: true,
        index: true
    },
    viewerId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    viewedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false,
    versionKey: false
});

// A user can only register a view once per story
StoryViewSchema.index({ storyId: 1, viewerId: 1 }, { unique: true });

module.exports = mongoose.model('StoryView', StoryViewSchema);
