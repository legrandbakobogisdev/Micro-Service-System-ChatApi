const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { storeRefreshToken, getRefreshToken, deleteRefreshToken, storeSession } = require('../config/redis');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { createLogger } = require('../../shared/utils/logger');
const { AuthError, ValidationError, NotFoundError } = require('../../shared/utils/errorHandler');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');

const logger = createLogger('auth-service');

/**
 * Generate JWT tokens
 */
function generateTokens(userId, role) {
    const accessToken = jwt.sign(
        { userId, role },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );
    const refreshToken = jwt.sign(
        { userId, role },
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
    const { email, password, firstName, lastName, phoneNumber, username, about, provider, profilePhotoUrl, profilePhotoPublicId } = req.body;

    // Check if user exists by email
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

    // Create user with default settings (WhatsApp-like)
    const user = await User.create({
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        username,
        about: about || 'Hey there! I am using ChatApp',
        provider: provider || 'email',
        profilePhotoUrl,
        profilePhotoPublicId,
        verificationToken: crypto.randomBytes(32).toString('hex'),
        // Default settings are defined in the schema
    });

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
    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

    // Store refresh token in Redis
    await storeRefreshToken(user.id, refreshToken);

    return ApiResponse.created(res, {
        user: user.toSafeObject(),
        accessToken,
        refreshToken
    }, 'User registered successfully');
});

/**
 * @desc Login user
 * @route POST /api/auth/login
 * @access Public
 */
exports.login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) throw new AuthError('Invalid credentials');
    if (!user.isActive) throw new AuthError('Account is suspended');

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) throw new AuthError('Invalid credentials');

    user.lastLoginAt = new Date();
    user.lastSeenAt = new Date();
    await user.save();

    logger.info(`User logged in: ${user.id} (${user.email})`);

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    await storeRefreshToken(user.id, refreshToken);

    const sessionId = crypto.randomUUID();
    await storeSession(sessionId, {
        userId: user.id,
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
            time: new Date(),
            ip: req.ip,
            userAgent: req.get('user-agent')
        });
    } catch (error) {
        logger.error('Failed to publish USER_LOGGED_IN event:', error);
    }

    return ApiResponse.success(res, {
        user: user.toSafeObject(),
        accessToken,
        refreshToken,
        sessionId
    }, 'Login successful');
});

/**
 * @desc Refresh access token
 * @route POST /api/auth/refresh
 * @access Public
 */
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

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role);
    await storeRefreshToken(user.id, newRefreshToken);

    return ApiResponse.success(res, { accessToken, refreshToken: newRefreshToken }, 'Token refreshed successfully');
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
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
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
                user.settings.privacy[key] = privacy[key];
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

    return ApiResponse.success(res, { blockedUsers: user.settings.account.blockedUsers }, `User ${action} successfully`);
});

/**
 * @desc Change password
 * @route PUT /api/auth/change-password
 * @access Private
 */
exports.changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    if (!user) throw new NotFoundError('User not found');

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) throw new AuthError('Current password is incorrect');

    user.password = newPassword;
    await user.save();
    await deleteRefreshToken(user.id);

    logger.info(`Password changed for user: ${user.id}`);
    return ApiResponse.success(res, null, 'Password changed successfully. Please login again.');
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
