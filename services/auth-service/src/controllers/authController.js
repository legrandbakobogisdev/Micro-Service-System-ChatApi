const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { createLogger } = require('../../shared/utils/logger');
const { AuthError, ValidationError, NotFoundError } = require('../../shared/utils/errorHandler');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');
const { normalizePhoneNumber } = require('../utils/phone');
const { 
    storeRefreshToken, 
    getRefreshToken, 
    deleteRefreshToken, 
    storeSession,
    registerPhoneInRedis, 
    checkPhonesInRedis, 
    removePhoneFromRedis,
    storeOTP,
    getOTP,
    deleteOTP,
    redisClient
} = require('../config/redis');
const mailer = require('../utils/mailer');

const logger = createLogger('auth-service');

/**
 * Generate JWT tokens
 */
function generateTokens(userId, role, isPremium = false) {
    const accessToken = jwt.sign(
        { userId, role, isPremium },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );
    const refreshToken = jwt.sign(
        { userId, role, isPremium },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
    );
    return { accessToken, refreshToken };
}

/**
 * @desc Register new user
 * @route POST /api/auth/register
 * @access Public
 */
exports.register = asyncHandler(async (req, res) => {
    const { email, code, firstName, lastName, phoneNumber, username, about, profilePhotoUrl, profilePhotoPublicId, provider } = req.body;

    // 0. Verify OTP code
    const identifier = email || (phoneNumber ? normalizePhoneNumber(phoneNumber) : null);
    const storedCode = await getOTP(identifier);
    if (!storedCode || storedCode !== code) {
        throw new AuthError('Invalid or expired verification code');
    }
    // Cleanup OTP
    await deleteOTP(identifier);

    // 1. Check if user exists by email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new ValidationError('Email already registered');
    }

    // Check username uniqueness if provided
    if (username) {
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            throw new ValidationError('Username already taken');
        }
    }

    // Normalize phone number if provided
    const normalizedPhone = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
    if (phoneNumber && !normalizedPhone) {
        throw new ValidationError('Invalid phone number format');
    }

    // Check if phone number already exists
    if (normalizedPhone) {
        const existingPhone = await User.findOne({ phoneNumber: normalizedPhone });
        if (existingPhone) {
            throw new ValidationError('Phone number already registered');
        }
    }

    // Create user with default settings (WhatsApp-like)
    const user = await User.create({
        email,
        firstName,
        lastName,
        phoneNumber: normalizedPhone,
        username,
        about: about || 'Hey there! I am using ChatApp',
        provider: provider || 'email',
        profilePhotoUrl,
        profilePhotoPublicId,
        isVerified: true, // Verified via OTP
        verificationToken: crypto.randomBytes(32).toString('hex'),
    });

    // Store in Redis for sync (Feature)
    if (normalizedPhone) {
        await registerPhoneInRedis(normalizedPhone, user.id);
    }

    logger.info(`User registered: ${user.id} (${user.email})`);

    // Publish to Kafka
    try {
        const producer = getProducer('auth-service');
        await producer.sendMessage(TOPICS.USER_CREATED, {
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            phoneNumber: user.phoneNumber,
            profilePhotoUrl: user.profilePhotoUrl,
            about: user.about
        });
    } catch (error) {
        logger.error('Failed to publish USER_CREATED event:', error);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.role, user.isPremium);

    // Store refresh token in Redis
    await storeRefreshToken(user.id, refreshToken);

    return ApiResponse.created(res, {
        user: user.toSafeObject(),
        accessToken,
        refreshToken
    }, 'User registered successfully');
});



exports.refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new ValidationError('Refresh token required');

    let decoded;
    try {
        decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
        throw new AuthError('Invalid refresh token');
    }

    const storedToken = await getRefreshToken(decoded.userId);
    if (storedToken !== refreshToken) throw new AuthError('Refresh token not found or expired');

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) throw new AuthError('User not found or inactive');

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role, user.isPremium);
    await storeRefreshToken(user.id, newRefreshToken);

    return ApiResponse.success(res, { accessToken, refreshToken: newRefreshToken }, 'Token refreshed successfully');
});

/**
 * @desc Request login/register OTP
 * @route POST /api/auth/request-otp
 * @access Public
 */
exports.requestOTP = asyncHandler(async (req, res) => {
    const { email, phoneNumber } = req.body;
    let targetEmail = email;

    // If only phone provided, find user's email
    if (phoneNumber && !email) {
        const normalized = normalizePhoneNumber(phoneNumber);
        const user = await User.findOne({ phoneNumber: normalized });
        if (!user) {
            throw new NotFoundError('No account found with this phone number. Please provide an email for your first connection.');
        }
        targetEmail = user.email;
    }

    if (!targetEmail) {
        throw new ValidationError('Email is required for new users');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store in Redis (use identifier for lookup later)
    // If email is provided, use it as primary identifier since it receives the code
    const identifier = targetEmail || (phoneNumber ? normalizePhoneNumber(phoneNumber) : null);
    await storeOTP(identifier, code);

    // Send email
    await mailer.sendOTP(targetEmail, code);

    logger.info(`OTP requested for ${identifier}`);
    return ApiResponse.success(res, { identifier }, 'Verification code sent to email');
});

/**
 * @desc Verify OTP and Login/Ready for Register
 * @route POST /api/auth/verify-otp
 * @access Public
 */
exports.verifyOTP = asyncHandler(async (req, res) => {
    let { identifier, code, deviceId, fcmToken, deviceInfo } = req.body;

    // Normalize identifier to match how it was stored
    if (identifier.includes('@')) {
        identifier = identifier.toLowerCase().trim();
    } else {
        const normalized = normalizePhoneNumber(identifier);
        if (normalized) identifier = normalized;
    }

    const storedCode = await getOTP(identifier);
    if (!storedCode || storedCode !== code) {
        throw new AuthError('Invalid or expired verification code');
    }

    // Code is valid (Will be deleted in login flow below or in register function)

    // Check if user exists
    let user;
    if (identifier.includes('@')) {
        user = await User.findOne({ email: identifier.toLowerCase() });
    } else {
        const normalized = normalizePhoneNumber(identifier);
        user = await User.findOne({ phoneNumber: normalized });
    }

    if (user) {
        // LOGIN FLOW
        await deleteOTP(identifier);
        if (!user.isActive) throw new AuthError('Account is suspended');
        
        user.lastLoginAt = new Date();
        user.lastSeenAt = new Date();
        user.isVerified = true;
        await user.save();

        const { accessToken, refreshToken } = generateTokens(user.id, user.role, user.isPremium);
        await storeRefreshToken(user.id, refreshToken);

        const sessionId = crypto.randomUUID();
        await storeSession(sessionId, {
            userId: user.id,
            deviceId: deviceId || 'unknown',
            ip: req.ip,
            userAgent: req.get('user-agent'),
            lastAccess: new Date(),
            location: 'Unknown'
        }, 604800);

        try {
            const producer = getProducer('auth-service');
            await producer.sendMessage(TOPICS.USER_LOGGED_IN, {
                userId: user.id,
                email: user.email,
                deviceId: deviceId || 'unknown',
                time: new Date(),
                ip: req.ip,
                userAgent: req.get('user-agent')
            }, user.id);
        } catch (err) {
            logger.error('Failed to publish login event:', err);
        }

        return ApiResponse.success(res, {
            user: user.toSafeObject(),
            accessToken,
            refreshToken,
            sessionId,
            isNewUser: false
        }, 'Login successful');
    } else {
        // REGISTRATION PATH - just confirm code is valid, user must call /register
        return ApiResponse.success(res, {
            identifier,
            code, // Return code so client can send it back to /register if needed, or just tell client to call /register
            isNewUser: true
        }, 'Verification successful. Please complete your profile.');
    }
});

/**
 * @desc Logout user
 * @route POST /api/auth/logout
 * @access Private
 */
exports.logout = asyncHandler(async (req, res) => {
    await deleteRefreshToken(req.user.id);
    logger.info(`User logged out: ${req.user.id}`);
    return ApiResponse.success(res, null, 'Logout successful');
});

/**
 * @desc Get current user profile
 * @route GET /api/auth/profile
 * @access Private
 */
exports.getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User not found');
    return ApiResponse.success(res, user.toSafeObject(), 'Profile retrieved successfully');
});

/**
 * @desc Get any user profile by ID
 * @route GET /api/auth/users/:userId
 * @access Private
 */
exports.getUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) throw new NotFoundError('User not found');
    return ApiResponse.success(res, user.toSafeObject(), 'User retrieved successfully');
});

/**
 * @desc Update user profile
 * @route PUT /api/auth/profile
 * @access Private
 */
exports.updateProfile = asyncHandler(async (req, res) => {
    const { firstName, lastName, phoneNumber, username, about, profilePhotoUrl, profilePhotoPublicId } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User not found');

    if (username && username !== user.username) {
        const existing = await User.findOne({ username });
        if (existing) throw new ValidationError('Username already taken');
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    
    // Handle phone number update with normalization and Redis sync
    if (phoneNumber !== undefined && phoneNumber !== user.phoneNumber) {
        const normalized = normalizePhoneNumber(phoneNumber);
        if (phoneNumber && !normalized) throw new ValidationError('Invalid phone number format');
        
        if (normalized) {
            const existing = await User.findOne({ phoneNumber: normalized, _id: { $ne: user.id } });
            if (existing) throw new ValidationError('Phone number already in use');
            
            // Remove old from Redis, add new
            if (user.phoneNumber) await removePhoneFromRedis(user.phoneNumber);
            await registerPhoneInRedis(normalized, user.id);
        } else if (user.phoneNumber) {
            await removePhoneFromRedis(user.phoneNumber);
        }
        
        user.phoneNumber = normalized;
    }

    if (username !== undefined) user.username = username;
    if (about !== undefined) user.about = about;
    if (profilePhotoUrl !== undefined) user.profilePhotoUrl = profilePhotoUrl;
    if (profilePhotoPublicId !== undefined) user.profilePhotoPublicId = profilePhotoPublicId;

    await user.save();
    logger.info(`User profile updated: ${user.id}`);

    try {
        const producer = getProducer('auth-service');
        await producer.sendMessage(TOPICS.USER_UPDATED, {
            userId: user.id,
            email: user.email,
            updates: { firstName, lastName, phoneNumber, username, about, profilePhotoUrl }
        });
    } catch (error) {
        logger.error('Failed to publish USER_UPDATED event:', error);
    }

    return ApiResponse.success(res, user.toSafeObject(), 'Profile updated successfully');
});

/**
 * @desc Update user settings (WhatsApp-like)
 * @route PUT /api/auth/settings
 * @access Private
 */
exports.updateSettings = asyncHandler(async (req, res) => {
    const { privacy, notifications, chat, account } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User not found');

    // Deep merge settings
    if (privacy) {
        Object.keys(privacy).forEach(key => {
            if (user.settings.privacy[key] !== undefined) {
                // Arrays like storyExcept and storyOnlyShareWith must be replaced entirely
                if (Array.isArray(privacy[key])) {
                    user.settings.privacy[key] = privacy[key];
                } else {
                    user.settings.privacy[key] = privacy[key];
                }
            }
        });
    }
    if (notifications) {
        Object.keys(notifications).forEach(key => {
            if (user.settings.notifications[key] !== undefined) {
                user.settings.notifications[key] = notifications[key];
            }
        });
    }
    if (chat) {
        Object.keys(chat).forEach(key => {
            if (key === 'mediaAutoDownload' && typeof chat[key] === 'object') {
                Object.assign(user.settings.chat.mediaAutoDownload, chat[key]);
            } else if (user.settings.chat[key] !== undefined) {
                user.settings.chat[key] = chat[key];
            }
        });
    }
    if (account) {
        if (account.language) user.settings.account.language = account.language;
        if (account.twoFactorEnabled !== undefined) user.settings.account.twoFactorEnabled = account.twoFactorEnabled;
    }

    user.markModified('settings');
    await user.save();

    logger.info(`User settings updated: ${user.id}`);
    return ApiResponse.success(res, user.toSafeObject(), 'Settings updated successfully');
});

/**
 * @desc Block/Unblock a user
 * @route POST /api/auth/settings/block/:targetUserId
 * @access Private
 */
exports.toggleBlockUser = asyncHandler(async (req, res) => {
    const { targetUserId } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User not found');

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) throw new NotFoundError('Target user not found');

    const blockedIndex = user.settings.account.blockedUsers.indexOf(targetUserId);
    let action;
    if (blockedIndex > -1) {
        user.settings.account.blockedUsers.splice(blockedIndex, 1);
        action = 'unblocked';
    } else {
        user.settings.account.blockedUsers.push(targetUserId);
        action = 'blocked';
    }

    user.markModified('settings');
    await user.save();
    logger.info(`User ${req.user.id} ${action} user ${targetUserId}`);

    // Publish to Kafka
    try {
        const producer = getProducer('auth-service');
        await producer.sendMessage(action === 'blocked' ? TOPICS.USER_BLOCKED : TOPICS.USER_UNBLOCKED, {
            blockerId: req.user.id,
            blockedId: targetUserId,
            time: new Date()
        }, req.user.id);
    } catch (error) {
        logger.error(`Failed to publish user.${action} event:`, error);
    }

    return ApiResponse.success(res, { blockedUsers: user.settings.account.blockedUsers }, `User ${action} successfully`);
});

/**
 * @desc Get list of blocked users
 * @route GET /api/auth/settings/blocked-users
 * @access Private
 */
exports.getBlockedUsers = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new NotFoundError('User not found');

    const blockedUserIds = user.settings.account.blockedUsers;
    const blockedUsers = await User.find({
        _id: { $in: blockedUserIds }
    }).select('firstName lastName username phoneNumber profilePhotoUrl about');

    return ApiResponse.success(res, blockedUsers, 'Blocked users retrieved successfully');
});



/**
 * @desc Update last seen timestamp
 * @route PATCH /api/auth/users/:userId/last-seen
 * @access Private (Internal)
 */
exports.updateLastSeen = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) throw new NotFoundError('User not found');
    user.lastSeenAt = new Date();
    await user.save();
    return ApiResponse.success(res, { lastSeenAt: user.lastSeenAt }, 'Last seen updated');
});

/**
 * @desc Sync contacts from device
 * @route POST /api/auth/contacts/sync
 * @access Private
 */
exports.syncContacts = asyncHandler(async (req, res) => {
    const { contacts } = req.body; // Array of raw strings
    const { countryCode = 'CM' } = req.query;

    if (!contacts || !Array.isArray(contacts)) {
        throw new ValidationError('Contacts array is required');
    }

    // 1. Normalize all numbers
    const normalizedMap = {}; // { normalized: raw }
    const normalizedList = [];
    
    contacts.forEach(raw => {
        const normalized = normalizePhoneNumber(raw, countryCode);
        if (normalized && !normalizedMap[normalized]) {
            normalizedMap[normalized] = raw;
            normalizedList.push(normalized);
        }
    });

    if (normalizedList.length === 0) {
        return ApiResponse.success(res, [], 'No valid phone numbers to sync');
    }

    // 2. Batch check in Redis (O(1) per lookup, bulk)
    const matchesMap = await checkPhonesInRedis(normalizedList); // { phone: userId }
    const matchUserIds = Object.values(matchesMap);

    if (matchUserIds.length === 0) {
        return ApiResponse.success(res, [], 'No contacts found on the platform');
    }

    // 3. Fetch user profiles for matches
    const users = await User.find({ 
        _id: { $in: matchUserIds },
        isActive: true 
    }).select('firstName lastName username phoneNumber profilePhotoUrl about lastSeenAt');

    // 4. Format response
    const results = users.map(user => {
        return {
            ...user.toObject(),
            rawContact: normalizedMap[user.phoneNumber]
        };
    });

    // 5. Emit Kafka session event for notification-service to map phone numbers to potential friends (Reverse lookup)
    try {
        const producer = getProducer('auth-service');
        await producer.sendMessage(TOPICS.CHAT_CONTACTS_SYNCED, {
            userId: req.user.id,
            syncedContacts: normalizedList // This will contain ALL valid normalized numbers from device
        });
    } catch (err) {
        logger.warn('Failed to publish CHAT_CONTACTS_SYNCED:', err);
    }

    return ApiResponse.success(res, results, `${results.length} contacts found`);
});
