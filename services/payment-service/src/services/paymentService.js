const { v4: uuidv4 } = require('uuid');
const Transaction = require('../models/Transaction');
const { getProvider } = require('../providers/providerFactory');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { BadRequestError, NotFoundError } = require('../../shared/utils/errorHandler');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('payment-service:paymentService');

class PaymentService {
    static generateTransactionId(prefix = 'PU') {
        const timestamp = Date.now().toString().slice(-8);
        const random = uuidv4().split('-')[0];
        return `${prefix}${timestamp}${random}`;
    }

    static buildNotifyUrl(baseUrl, providerName) {
        return `${baseUrl}/api/payment/webhook/${providerName}`;
    }

    async initializePayment(data) {
        const {
            amount,
            currency = 'XAF',
            returnUrl,
            notifyUrl,
            paymentCountry = 'CM',
            userId,
            metadata = {},
            provider: providerName = 'payunit'
        } = data;

        if (!amount || amount <= 0) throw new BadRequestError('Amount must be a positive number');
        if (!returnUrl) throw new BadRequestError('returnUrl is required');

        const provider = getProvider(providerName);
        const transactionId = PaymentService.generateTransactionId('PU');

        const transaction = await Transaction.create({
            transactionId,
            provider: providerName,
            type: 'collection',
            amount,
            currency,
            status: 'initiated',
            userId: userId || null,
            returnUrl,
            notifyUrl: notifyUrl || null,
            metadata
        });

        try {
            const effectiveNotifyUrl = notifyUrl 
                || (process.env.APP_BASE_URL 
                    ? PaymentService.buildNotifyUrl(process.env.APP_BASE_URL, providerName) 
                    : undefined);

            const result = await provider.initializePayment({
                amount,
                currency,
                transactionId,
                returnUrl,
                notifyUrl: effectiveNotifyUrl,
                paymentCountry
            });

            transaction.providerTransactionId = result.providerTransactionId;
            transaction.transactionUrl = result.transactionUrl;
            transaction.providerResponse = result.rawResponse;
            await transaction.save();

            await this._publishEvent(TOPICS.PAYMENT_INITIATED, {
                transactionId,
                providerTransactionId: result.providerTransactionId,
                amount,
                currency,
                provider: providerName,
                userId
            });

            return {
                transactionId,
                transactionUrl: result.transactionUrl,
                providers: result.providers,
                status: 'initiated'
            };
        } catch (error) {
            transaction.status = 'failed';
            transaction.errorMessage = error.message;
            await transaction.save();
            throw error;
        }
    }

    async handleWebhookNotification(providerName, payload) {
        const provider = getProvider(providerName);
        const parsed = provider.parseWebhookPayload(payload);

        logger.info(`Webhook received from ${providerName}: txn=${parsed.transactionId}, status=${parsed.status}`);

        const transaction = await Transaction.findOne({ transactionId: parsed.transactionId });
        if (!transaction) {
            logger.warn(`Webhook for unknown transaction: ${parsed.transactionId}`);
            return { acknowledged: true, transactionFound: false };
        }

        if (['success', 'failed', 'cancelled'].includes(transaction.status) && transaction.status === parsed.status) {
            return { acknowledged: true, alreadyProcessed: true };
        }

        transaction.status = parsed.status;
        transaction.gateway = parsed.gateway || transaction.gateway;
        transaction.webhookData = parsed.rawPayload;
        await transaction.save();

        if (parsed.status === 'success') {
            await this._handlePaymentSuccess(transaction);
        } else if (parsed.status === 'failed' || parsed.status === 'cancelled') {
            await this._handlePaymentFailure(transaction, parsed.status);
        }

        return { acknowledged: true, status: parsed.status, transactionId: parsed.transactionId };
    }

    async _handlePaymentSuccess(transaction) {
        await this._publishEvent(TOPICS.PAYMENT_SUCCESS, {
            transactionId: transaction.transactionId,
            userId: transaction.userId,
            amount: transaction.amount,
            currency: transaction.currency,
            provider: transaction.provider,
            gateway: transaction.gateway,
            metadata: transaction.metadata
        });
    }

    async _handlePaymentFailure(transaction, status) {
        await this._publishEvent(TOPICS.PAYMENT_FAILED, {
            transactionId: transaction.transactionId,
            userId: transaction.userId,
            amount: transaction.amount,
            currency: transaction.currency,
            reason: status
        });
    }

    async getTransactionById(transactionId) {
        const transaction = await Transaction.findOne({ transactionId });
        if (!transaction) {
            throw new NotFoundError(`Transaction ${transactionId} not found`);
        }
        return transaction;
    }

    async getUserTransactions(userId) {
        return await Transaction.find({ userId }).sort({ createdAt: -1 });
    }

    async getTransactionStatus(transactionId, providerName = 'payunit') {
        const transaction = await this.getTransactionById(transactionId);

        // If terminal state, return DB data
        if (['success', 'failed', 'cancelled'].includes(transaction.status)) {
            return transaction;
        }

        try {
            const provider = getProvider(providerName);
            const result = await provider.getTransactionStatus(transactionId);

            if (result.status !== transaction.status) {
                transaction.status = result.status;
                transaction.gateway = result.gateway || transaction.gateway;
                await transaction.save();

                if (result.status === 'success') {
                    await this._handlePaymentSuccess(transaction);
                } else if (result.status === 'failed' || result.status === 'cancelled') {
                    await this._handlePaymentFailure(transaction, result.status);
                }
            }
            return transaction;
        } catch (error) {
            logger.error(`Status check failed for ${transactionId}:`, error);
            return transaction;
        }
    }

    async _publishEvent(topic, payload) {
        try {
            const producer = getProducer('payment-service');
            await producer.sendMessage(topic, payload);
            logger.debug(`Published ${topic}`, { transactionId: payload.transactionId });
        } catch (error) {
            logger.error(`Failed to publish ${topic}:`, error);
        }
    }
}

module.exports = new PaymentService();
