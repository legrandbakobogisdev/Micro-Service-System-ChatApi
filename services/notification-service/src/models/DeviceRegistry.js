const mongoose = require('mongoose');

const deviceRegistrySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    deviceId: {
        type: String,
        required: true
    },
    fcmToken: {
        type: String,
        required: true
    },
    deviceInfo: {
        os: String,
        osVersion: String,
        model: String,
        appVersion: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// A unique combination of user and device for the registry
deviceRegistrySchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const DeviceRegistry = mongoose.model('DeviceRegistry', deviceRegistrySchema);
module.exports = DeviceRegistry;
