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

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, 
    message: { success: false, message: 'Too many requests to Gateway' }
});
app.use(limiter);
app.use(morgan('dev'));

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
    }
};

// Create proxies for each service
Object.keys(services).forEach(name => {
    const service = services[name];
    app.use(service.prefix, createProxyMiddleware({
        target: service.url,
        changeOrigin: true,
        onProxyReq: (proxyReq, req, res) => {
            // Forward client IP and correlation ID
            if (req.headers['x-correlation-id']) {
                proxyReq.setHeader('x-correlation-id', req.headers['x-correlation-id']);
            }
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
