/**
 * IPaymentProvider - Abstract Payment Provider Interface
 */
class IPaymentProvider {
    constructor(config) {
        if (new.target === IPaymentProvider) {
            throw new Error('IPaymentProvider is an abstract class and cannot be instantiated directly.');
        }
        this.config = config;
    }

    getName() {
        throw new Error('Method getName() must be implemented.');
    }

    async initializePayment(params) {
        throw new Error('Method initializePayment() must be implemented.');
    }

    async makePayment(params) {
        throw new Error('Method makePayment() must be implemented.');
    }

    async getTransactionStatus(transactionId) {
        throw new Error('Method getTransactionStatus() must be implemented.');
    }

    async getProviders(params) {
        throw new Error('Method getProviders() must be implemented.');
    }

    parseWebhookPayload(payload) {
        throw new Error('Method parseWebhookPayload() must be implemented.');
    }
}

module.exports = IPaymentProvider;
