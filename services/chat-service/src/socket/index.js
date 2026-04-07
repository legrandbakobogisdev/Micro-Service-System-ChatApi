const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { createLogger } = require('../../shared/utils/logger');
const chatHandler = require('./chatHandler');

const logger = createLogger('chat-socket');

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 5000,
        pingInterval: 10000,
    });

    // Authentication middleware for Socket.io
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.token;
        
        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            socket.user = { id: decoded.userId, role: decoded.role };
            next();
        } catch (error) {
            logger.error('Socket authentication failed:', error.message);
            return next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        logger.info(`User connected: ${socket.user.id} (Socket: ${socket.id})`);
        
        // Join user's personal room for direct events (like notifications)
        socket.join(socket.user.id);
        
        // Handle chat events
        chatHandler(io, socket);

        socket.on('disconnect', () => {
            logger.info(`User disconnected: ${socket.user.id}`);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

module.exports = { initSocket, getIO };
