require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8000;

// Security and basic middlewares
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// Rate limiting per user/IP (not global)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 30000, // 30k per user per 15min
    message: { success: false, message: 'Too many requests from this IP' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        // Use user ID if authenticated, otherwise use IP
        return req.user?.id || req.ip;
    },
    skip: (req, res) => {
        // Skip rate limiting for health checks
        return req.path === '/health';
    }
});
app.use(limiter);
app.use(morgan('dev'));

// Specific rate limiters for sensitive endpoints
const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute per user
    keyGenerator: (req, res) => req.user?.id || req.ip,
    skip: (req, res) => !req.user // Only limit authenticated users
});

const messageLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // 50 messages per minute per user
    keyGenerator: (req, res) => req.user?.id || req.ip,
    skip: (req, res) => !req.user
});

// Service configurations
const services = {
    auth: {
        url: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
        prefix: '/api/auth'
    },
    chat: {
         url: process.env.CHAT_SERVICE_URL || 'http://chat-service:3012',
         prefix: '/api/chat'
    },
    notification: {
         url: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008',
         prefix: '/api/notification'
    },
    media: {
         url: process.env.MEDIA_SERVICE_URL || 'http://media-service:3011',
         prefix: '/api/media'
    },
    subscription: {
        url: process.env.SUBSCRIPTION_SERVICE_URL || 'http://subscription-service:3003',
        prefix: '/api/subscription'
    },
    payment: {
        url: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3004',
        prefix: '/api/payment'
    },
    support: {
        url: process.env.SUPPORT_SERVICE_URL || 'http://support-service:3010',
        prefix: '/api/support'
    },
    analytics: {
        url: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3009',
        prefix: '/api/analytics'
    },
    story: {
        url: process.env.STORY_SERVICE_URL || 'http://story-service:3013',
        prefix: '/api/stories'
    }
};

// Create proxies for each service
Object.keys(services).forEach(name => {
    const service = services[name];
    
    // Apply specific limiters for chat service
    if (name === 'chat') {
        app.use(service.prefix, chatLimiter);
    }
    
    app.use(service.prefix, createProxyMiddleware({
        target: service.url,
        changeOrigin: true,
        ws: true,
        timeout: 60000,
        proxyTimeout: 60000,
        onProxyReq: (proxyReq, req, res) => {
            // Forward client IP and correlation ID
            if (req.headers['x-correlation-id']) {
                proxyReq.setHeader('x-correlation-id', req.headers['x-correlation-id']);
            }
            // Keep-alive for connection pooling
            proxyReq.setHeader('Connection', 'keep-alive');
        },
        onError: (err, req, res) => {
            console.error(`Proxy Error for ${name}:`, err);
            res.status(502).json({ success: false, message: 'Bad Gateway', service: name });
        }
    }));
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'api-gateway', timestamp: new Date() });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'API Route Not Found' });
});

app.listen(PORT, () => {
    console.log(`API Gateway listening on port ${PORT}`);
});
