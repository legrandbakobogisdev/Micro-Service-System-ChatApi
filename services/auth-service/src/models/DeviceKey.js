const mongoose = require('mongoose');

const deviceKeySchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    deviceId: { 
        type: String, 
        required: true 
    },
    // Meta information for E2E
    registrationId: {
        type: Number,
        required: true
    },
    identityKey: { 
        type: String, 
        required: true 
    },
    signedPreKey: {
        keyId: { type: Number, required: true },
        publicKey: { type: String, required: true },
        signature: { type: String, required: true }
    },
    oneTimePreKeys: [{
        keyId: { type: Number, required: true },
        publicKey: { type: String, required: true }
    }]
}, {
    timestamps: true
});

// A user can have multiple devices, but each device ID must be unique per user
deviceKeySchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const DeviceKey = mongoose.model('DeviceKey', deviceKeySchema);
module.exports = DeviceKey;
