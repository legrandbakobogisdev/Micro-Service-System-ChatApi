const mongoose = require('mongoose');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('media-service');

const connectMongoDB = async () => {
    try {
        let mongoURI = process.env.MONGODB_URI;
        if (process.env.MONGODB_HOST) {
            const host = process.env.MONGODB_HOST || 'localhost';
            const port = process.env.MONGODB_PORT || 27017;
            const user = process.env.MONGODB_USER || 'marketplace_user';
            const pass = process.env.MONGODB_PASSWORD;
            const db = process.env.MONGODB_DB_NAME || 'media_db';
            mongoURI = `mongodb://${user}:${pass}@${host}:${port}/${db}?authSource=admin`;
        }
        if (!mongoURI) {
            logger.warn('MongoDB configuration not found.');
            return false;
        }
        await mongoose.connect(mongoURI);
        logger.info('MongoDB connected successfully');
        return true;
    } catch (error) {
        logger.error('Failed to connect to MongoDB:', error.message);
        return false;
    }
};

const disconnectMongoDB = async () => {
    try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
    } catch (error) {
        logger.error('Error closing MongoDB connection:', error.message);
    }
};

module.exports = { connectMongoDB, disconnectMongoDB, mongoose };
