const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    username: String,
    firstName: String,
    lastName: String,
    profilePhotoUrl: String,
    isPremium: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model('User', UserSchema);
