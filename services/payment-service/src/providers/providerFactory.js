const PayunitProvider = require('./PayunitProvider');
const payunitConfig = require('../config/payunit');

const providers = {};

/**
 * Initialize and get a payment provider
 * @param {string} name - Provider name (e.g. 'payunit')
 * @returns {IPaymentProvider}
 */
exports.getProvider = (name = 'payunit') => {
    if (providers[name]) return providers[name];

    if (name === 'payunit') {
        providers[name] = new PayunitProvider(payunitConfig);
        return providers[name];
    }

    throw new Error(`Payment provider ${name} is not supported.`);
};
