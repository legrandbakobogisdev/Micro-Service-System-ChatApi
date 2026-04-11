require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { createLogger } = require('../shared/utils/logger');
const { errorHandler, notFoundHandler, handleUnhandledRejection, handleUncaughtException } = require('../shared/utils/errorHandler');
const { tracingMiddleware } = require('../shared/utils/tracing');
const { connectMongoDB, disconnectMongoDB } = require('./config/mongodb');
const { getProducer } = require('../shared/kafka-config/producer');
const paymentRoutes = require('./routes/payment.routes');
const ApiResponse = require('../shared/utils/response');

const app = express();
const PORT = process.env.PORT || 3004;  
const logger = createLogger('payment-service');

app.set('trust proxy', 1);
app.use(tracingMiddleware);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

morgan.token('cid', (req) => req.correlationId || 'N/A');
app.use(morgan(':method :url :status :res[content-length] - :response-time ms | CID: :cid', { stream: logger.stream }));

app.get('/health', (req, res) => {
    ApiResponse.success(res, { service: 'payment-service', status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/api/payment', paymentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function initializeServices() {
    try {
        logger.info('Initializing Payment Service...');

        logger.info('Connecting to Kafka...');
        try {
            const producer = getProducer('payment-service');
            await producer.connect();
        } catch (error) {
            logger.warn('Kafka connection failed, will retry in background:', error.message);
        }

        logger.info('Connecting to MongoDB...');
        const mongoConnected = await connectMongoDB();
        if (!mongoConnected) throw new Error('Failed to connect to MongoDB');

        logger.info('All services initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize services:', error);
        throw error;
    }
}

async function gracefulShutdown(signal) {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    if (server) server.close(() => logger.info('HTTP server closed'));
    await disconnectMongoDB();
    const producer = getProducer('payment-service');
    await producer.disconnect();
    logger.info('Graceful shutdown completed');
    process.exit(0);
}

let server;
async function startServer() {
    try {
        await initializeServices();
        server = app.listen(PORT, () => {
            logger.info(`Payment Service listening on port ${PORT}`);
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
