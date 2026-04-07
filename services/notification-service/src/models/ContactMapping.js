const mongoose = require('mongoose');

/**
 * ContactMapping Schema
 * Stores which users have which phone numbers in their contacts.
 * Used for "X joined the app" notifications.
 */
const contactMappingSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        index: true // E.164 format
    },
    researcherUserId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    lastSyncedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index to ensure uniqueness per user-phone pair
contactMappingSchema.index({ phone: 1, researcherUserId: 1 }, { unique: true });

const ContactMapping = mongoose.model('ContactMapping', contactMappingSchema);
module.exports = ContactMapping;
