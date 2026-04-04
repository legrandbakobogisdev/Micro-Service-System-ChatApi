const redis = require('redis');
const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('auth-service');

const redisClient = redis.createClient({
    socket: { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
    password: process.env.REDIS_PASSWORD || undefined,
    database: 0
});

redisClient.on('connect', () => logger.info('Redis client connecting...'));
redisClient.on('ready', () => logger.info('Redis client ready'));
redisClient.on('error', (error) => logger.error('Redis client error:', error));
redisClient.on('end', () => logger.info('Redis client disconnected'));

async function connectRedis() {
    try {
        if (!redisClient.isOpen) { await redisClient.connect(); logger.info('Redis connection established'); }
        return true;
    } catch (error) { logger.error('Unable to connect to Redis:', error); return false; }
}

async function storeRefreshToken(userId, refreshToken, expiryInSeconds = 604800) {
    await redisClient.setEx(`refresh_token:${userId}`, expiryInSeconds, refreshToken);
}

async function getRefreshToken(userId) {
    try { return await redisClient.get(`refresh_token:${userId}`); }
    catch (error) { logger.error('Error getting refresh token:', error); return null; }
}

async function deleteRefreshToken(userId) {
    await redisClient.del(`refresh_token:${userId}`);
}

async function storeSession(sessionId, data, expiryInSeconds = 3600) {
    const { userId } = data;
    await redisClient.setEx(`session:${sessionId}`, expiryInSeconds, JSON.stringify(data));
    if (userId) await redisClient.sAdd(`user_sessions:${userId}`, sessionId);
}

async function getSession(sessionId) {
    try {
        const data = await redisClient.get(`session:${sessionId}`);
        return data ? JSON.parse(data) : null;
    } catch (error) { logger.error('Error getting session:', error); return null; }
}

async function deleteSession(sessionId, userId = null) {
    if (!userId) { const data = await getSession(sessionId); if (data) userId = data.userId; }
    await redisClient.del(`session:${sessionId}`);
    if (userId) await redisClient.sRem(`user_sessions:${userId}`, sessionId);
}

async function getUserSessions(userId) {
    try {
        const sessionIds = await redisClient.sMembers(`user_sessions:${userId}`);
        const sessions = [];
        for (const sessionId of sessionIds) {
            const sessionData = await getSession(sessionId);
            if (sessionData) sessions.push({ ...sessionData, sessionId });
            else await redisClient.sRem(`user_sessions:${userId}`, sessionId);
        }
        return sessions;
    } catch (error) { logger.error('Error getting user sessions:', error); return []; }
}

async function disconnectRedis() {
    if (redisClient.isOpen) { await redisClient.quit(); logger.info('Redis client disconnected gracefully'); }
}

module.exports = {
    redisClient, connectRedis, disconnectRedis,
    storeRefreshToken, getRefreshToken, deleteRefreshToken,
    storeSession, getSession, deleteSession, getUserSessions
};
