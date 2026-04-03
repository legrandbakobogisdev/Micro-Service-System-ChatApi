const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { getCorrelationId } = require('./tracing');

function createLogger(serviceName = 'chatapp', logLevel = null) {
    const level = logLevel || process.env.LOG_LEVEL || 'info';
    const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const SENSITIVE_KEYS = ['password', 'token', 'accessToken', 'refreshToken', 'secret', 'apiKey'];

    const redactFormat = winston.format((info) => {
        const redact = (obj) => {
            for (const key in obj) {
                if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
                    obj[key] = '***';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    redact(obj[key]);
                }
            }
            return obj;
        };
        if (info.metadata) {
            info.metadata = redact(JSON.parse(JSON.stringify(info.metadata)));
        }
        return info;
    });

    const logFormat = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service', 'correlationId'] }),
        winston.format((info) => {
            const correlationId = getCorrelationId();
            if (correlationId) info.correlationId = correlationId;
            return info;
        })(),
        redactFormat(),
        winston.format.json()
    );

    const transports = [
        new winston.transports.Console({ format: logFormat }),
        new winston.transports.File({
            filename: path.join(logDir, `${serviceName}-combined.log`),
            format: logFormat, maxsize: 10485760, maxFiles: 5
        }),
        new winston.transports.File({
            filename: path.join(logDir, `${serviceName}-error.log`),
            level: 'error', format: logFormat, maxsize: 10485760, maxFiles: 5
        })
    ];

    const logger = winston.createLogger({ level, defaultMeta: { service: serviceName }, transports, exitOnError: false });
    logger.stream = { write: (message) => logger.info(message.trim()) };
    return logger;
}

const logger = createLogger();
module.exports = { createLogger, logger };
