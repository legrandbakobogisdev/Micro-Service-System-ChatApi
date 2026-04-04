require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const { createLogger } = require('../shared/utils/logger');
const { errorHandler, notFoundHandler, handleUnhandledRejection, handleUncaughtException } = require('../shared/utils/errorHandler');
const { tracingMiddleware } = require('../shared/utils/tracing');
const { initializeFirebase } = require('./config/firebase');
const { connectConsumer, disconnectConsumer } = require('./config/kafka');
const Notification = require('./models/Notification');
const ApiResponse = require('../shared/utils/response');

const app = express();
const PORT = process.env.PORT || 3008;
const logger = createLogger('notification-service');

app.set('trust proxy', 1);
app.use(tracingMiddleware);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

morgan.token('cid', (req) => req.correlationId || 'N/A');
app.use(morgan(':method :url :status :res[content-length] - :response-time ms | CID: :cid', { stream: logger.stream }));

// MongoDB Connection
const connectMongoDB = async () => {
    try {
        let mongoURI = process.env.MONGODB_URI;
        if (process.env.MONGODB_HOST) {
            const host = process.env.MONGODB_HOST || 'localhost';
            const port = process.env.MONGODB_PORT || 27017;
            const user = process.env.MONGODB_USER || 'marketplace_user';
            const pass = process.env.MONGODB_PASSWORD || process.env.MONGODB_PASSWORD_NOTIFICATION || process.env.MONGODB_PASSWORD;
            const db = process.env.MONGODB_DB_NAME || 'notification_db';
            mongoURI = `mongodb://${user}:${pass}@${host}:${port}/${db}?authSource=admin`;
        }
        if (!mongoURI) {
            logger.warn('MongoDB configuration not found.');
            return false;
        }
        await mongoose.connect(mongoURI);
        logger.info('Notification-Service MongoDB connected');
        return true;
    } catch (err) {
        logger.error('Failed to connect Notification-Service MongoDB:', err.message);
        return false;
    }
};

const notificationRoutes = require('./routes/notification.routes');

// API routes
app.use('/api/notification', notificationRoutes);

// Health check (for Docker & Load Balancers)
app.get('/health', (req, res) => {
    ApiResponse.success(res, { status: 'healthy', service: 'notification-service' }, 'Service is healthy');
});

// 404 & Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// App Initiation
async function start() {
    try {
        await connectMongoDB();
        initializeFirebase();
        await connectConsumer();

        app.listen(PORT, () => {
            logger.info(`Notification-Service running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV}`);
        });

        process.on('SIGTERM', async () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', async () => gracefulShutdown('SIGINT'));
        handleUnhandledRejection(logger);
        handleUncaughtException(logger);
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

async function gracefulShutdown(signal) {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    await disconnectConsumer();
    await mongoose.connection.close();
    logger.info('Graceful shutdown completed');
    process.exit(0);
}

start();
