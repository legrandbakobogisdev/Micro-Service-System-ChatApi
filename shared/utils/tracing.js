const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const tracingContext = new AsyncLocalStorage();

const tracingMiddleware = (req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    const context = { correlationId };
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    tracingContext.run(context, () => {
        if (typeof next === 'function') {
            next();
        }
    });
};

const getCorrelationId = () => {
    const context = tracingContext.getStore();
    return context ? context.correlationId : null;
};

const runWithContext = (context, fn) => {
    return tracingContext.run(context, fn);
};

module.exports = { tracingMiddleware, getCorrelationId, runWithContext, tracingContext };
