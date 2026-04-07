const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User Schema for Real-Time Chat Application
 * Includes WhatsApp-like settings (privacy, notifications, chat preferences)
 */
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    password: {
        type: String,
        required: true,
        select: true
    },
    phoneNumber: {
        type: String,
        trim: true,
        required: true,
        sparse: true
    },
    username: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    firstName: {
        type: String,
        trim: true
    },
    lastName: {
        type: String,
        trim: true
    },
    about: {
        type: String,
        default: 'Hey there! I am using ChatApp',
        maxlength: 500
    },
    profilePhotoUrl: {
        type: String
    },
    profilePhotoPublicId: {
        type: String
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'super_admin'],
        default: 'user'
    },
    provider: {
        type: String,
        enum: ['email', 'google', 'apple'],
        required: true,
        default: 'email'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: {
        type: String,
        select: false
    },
    resetPasswordToken: {
        type: String,
        select: false
    },
    resetPasswordExpires: {
        type: Date,
        select: false
    },
    lastLoginAt: {
        type: Date
    },
    lastSeenAt: {
        type: Date
    },

    // ===================================================
    // SETTINGS (WhatsApp-like)
    // ===================================================
    settings: {
        // Privacy settings
        privacy: {
            lastSeen: {
                type: String,
                enum: ['everyone', 'contacts', 'nobody'],
                default: 'everyone'
            },
            profilePhoto: {
                type: String,
                enum: ['everyone', 'contacts', 'nobody'],
                default: 'everyone'
            },
            about: {
                type: String,
                enum: ['everyone', 'contacts', 'nobody'],
                default: 'everyone'
            },
            readReceipts: {
                type: Boolean,
                default: true
            },
            onlineStatus: {
                type: String,
                enum: ['everyone', 'contacts', 'nobody'],
                default: 'everyone'
            }
        },

        // Notification settings
        notifications: {
            messageNotifications: {
                type: Boolean,
                default: true
            },
            showPreview: {
                type: Boolean,
                default: true
            },
            sound: {
                type: String,
                default: 'default'
            },
            vibrate: {
                type: Boolean,
                default: true
            },
            groupNotifications: {
                type: Boolean,
                default: true
            },
            callNotifications: {
                type: Boolean,
                default: true
            }
        },

        // Chat settings
        chat: {
            theme: {
                type: String,
                enum: ['light', 'dark', 'system'],
                default: 'system'
            },
            wallpaper: {
                type: String,
                default: null
            },
            fontSize: {
                type: String,
                enum: ['small', 'medium', 'large'],
                default: 'medium'
            },
            enterToSend: {
                type: Boolean,
                default: true
            },
            mediaAutoDownload: {
                wifi: { type: Boolean, default: true },
                mobileData: { type: Boolean, default: false }
            }
        },

        // Account settings
        account: {
            twoFactorEnabled: {
                type: Boolean,
                default: false
            },
            twoFactorSecret: {
                type: String,
                select: false
            },
            language: {
                type: String,
                default: 'fr'
            },
            blockedUsers: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }]
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Index for search
userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

/**
 * Pre-save middleware to hash password
 */
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compare password with hashed password
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Get user without sensitive fields
 */
userSchema.methods.toSafeObject = function () {
    const user = this.toObject();
    delete user.password;
    delete user.__v;
    delete user.verificationToken;
    delete user.resetPasswordToken;
    delete user.resetPasswordExpires;
    if (user.settings && user.settings.account) {
        delete user.settings.account.twoFactorSecret;
    }
    return user;
};

/**
 * Virtual: full name
 */
userSchema.virtual('fullName').get(function () {
    if (this.firstName && this.lastName) return `${this.firstName} ${this.lastName}`;
    return this.firstName || this.lastName || this.username || 'User';
});

const User = mongoose.model('User', userSchema);
module.exports = User;
