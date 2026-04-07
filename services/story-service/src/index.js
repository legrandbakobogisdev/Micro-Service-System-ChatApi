require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { createLogger } = require('../shared/utils/logger');
const { errorHandler, notFoundHandler, handleUnhandledRejection, handleUncaughtException } = require('../shared/utils/errorHandler');
const { tracingMiddleware } = require('../shared/utils/tracing');
const { connectRedis, disconnectRedis } = require('./config/redis');
const { connectMongoDB, disconnectMongoDB } = require('./config/mongodb');
const { getProducer } = require('../shared/kafka-config/producer');

const storyRoutes = require('./routes/story.routes');
const ApiResponse = require('../shared/utils/response');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3013;
const logger = createLogger('story-service');

// Trust proxy
app.set('trust proxy', 1);

// Middleware
app.use(tracingMiddleware);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));

// Rate limiting
app.use(rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),
    message: { success: false, message: 'Too many requests, please try again later' }
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
morgan.token('cid', (req) => req.correlationId || 'N/A');
app.use(morgan(':method :url :status :res[content-length] - :response-time ms | CID: :cid', { stream: logger.stream }));

// Health check
app.get('/health', (req, res) => {
    ApiResponse.success(res, { service: 'story-service', status: 'healthy', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/stories', storyRoutes);

// 404 & Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Initialize connections
 */
async function initializeServices() {
    try {
        logger.info('Initializing Story Service...');

        logger.info('Connecting to Redis...');
        const redisConnected = await connectRedis();
        if (!redisConnected) throw new Error('Failed to connect to Redis');

        logger.info('Connecting to Kafka...');
        try {
            const producer = getProducer('story-service');
            await producer.connect();
        } catch (error) {
            logger.warn('Kafka connection failed, will retry in background:', error.message);
        }

        logger.info('Connecting to MongoDB...');
        const mongoConnected = await connectMongoDB();
        if (!mongoConnected) throw new Error('Failed to connect to MongoDB');

        logger.info('All database services initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize services:', error);
        throw error;
    }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    if (server) server.close(() => logger.info('HTTP server closed'));
    await disconnectRedis();
    await disconnectMongoDB();
    const producer = getProducer('story-service');
    await producer.disconnect();
    logger.info('Graceful shutdown completed');
    process.exit(0);
}

/**
 * Start server
 */
async function startServer() {
    try {
        await initializeServices();
        server.listen(PORT, () => {
            logger.info(`Story Service listening on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV}`);
            logger.info(`Health check: http://localhost:${PORT}/health`);
        });
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        handleUnhandledRejection(logger);
        handleUncaughtException(logger);
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
module.exports = app;
