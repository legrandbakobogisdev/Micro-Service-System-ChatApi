const redis = require('redis');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('story-service');

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
        if (!redisClient.isOpen) {
            await redisClient.connect();
            logger.info('Redis connection established');
        }
        return true;
    } catch (error) {
        logger.error('Unable to connect to Redis:', error);
        return false;
    }
}

async function disconnectRedis() {
    if (redisClient.isOpen) {
        await redisClient.quit();
        logger.info('Redis client disconnected gracefully');
    }
}

module.exports = { redisClient, connectRedis, disconnectRedis };
