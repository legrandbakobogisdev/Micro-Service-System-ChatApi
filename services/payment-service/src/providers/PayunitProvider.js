const axios = require('axios');
const IPaymentProvider = require('./IPaymentProvider');
const { createLogger } = require('../../shared/utils/logger');
const { BadRequestError, AppError } = require('../../shared/utils/errorHandler');

const logger = createLogger('payment-service:payunit');

class PayunitProvider extends IPaymentProvider {
    constructor(config) {
        super(config);

        if (!config.apiKey || !config.apiUsername || !config.apiPassword) {
            throw new Error('PayUnit provider requires apiKey, apiUsername, and apiPassword.');
        }

        this.baseURL = config.baseURL || 'https://gateway.payunit.net';
        this.mode = config.mode || 'test';
        this.timeout = config.timeout || 10000;

        const credentials = Buffer.from(`${config.apiUsername}:${config.apiPassword}`).toString('base64');

        this.httpClient = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Authorization': `Basic ${credentials}`,
                'x-api-key': config.apiKey,
                'x-api-user': config.apiUsername,
                'x-api-mode': this.mode,
                'mode': this.mode,
                'Referer': 'https://payunit.net/'
            }
        });
    }

    getName() {
        return 'payunit';
    }

    async initializePayment({ amount, currency, transactionId, returnUrl, notifyUrl, paymentCountry }) {
        try {
            const body = {
                total_amount: amount,
                currency: currency || 'XAF',
                transaction_id: transactionId,
                return_url: returnUrl,
            };

            if (notifyUrl) body.notify_url = notifyUrl;
            if (paymentCountry) body.payment_country = paymentCountry;

            const response = await this.httpClient.post('/api/gateway/initialize', body);
            const data = response.data;

            if (data.status !== 'SUCCESS') {
                throw new AppError(data.message || 'Payment initialization failed on PayUnit', 502);
            }

            return {
                providerTransactionId: data.data.transaction_id,
                transactionUrl: data.data.transaction_url,
                tId: data.data.t_id,
                tSum: data.data.t_sum,
                tUrl: data.data.t_url,
                providers: data.data.providers || [],
                rawResponse: data
            };
        } catch (error) {
            this._handleProviderError(error, 'initializePayment');
        }
    }

    async makePayment({ gateway, amount, currency, transactionId, phoneNumber, returnUrl, notifyUrl }) {
        try {
            const body = {
                gateway,
                amount,
                currency: currency || 'XAF',
                transaction_id: transactionId,
                phone_number: phoneNumber,
                return_url: returnUrl,
                paymentType: 'button'
            };

            if (notifyUrl) body.notify_url = notifyUrl;

            const response = await this.httpClient.post('/api/gateway/makepayment', body);
            const data = response.data;

            if (data.status !== 'SUCCESS') {
                throw new AppError(data.message || 'Payment execution failed on PayUnit', 502);
            }

            return {
                providerTransactionId: data.data.transaction_id,
                providerPaymentId: data.data.id,
                paymentStatus: data.data.payment_status || 'PENDING',
                providerRefId: data.data.provider_transaction_id,
                rawResponse: data
            };
        } catch (error) {
            this._handleProviderError(error, 'makePayment');
        }
    }

    async getTransactionStatus(transactionId) {
        try {
            const response = await this.httpClient.get(`/api/gateway/paymentstatus/${transactionId}`);
            const data = response.data;

            if (data.status !== 'SUCCESS') {
                throw new AppError(data.message || 'Failed to get transaction status from PayUnit', 502);
            }

            return {
                status: this._normalizeStatus(data.data.transaction_status),
                providerStatus: data.data.transaction_status,
                amount: data.data.transaction_amount,
                currency: data.data.transaction_currency,
                gateway: data.data.transaction_gateway,
                message: data.data.message,
                rawResponse: data
            };
        } catch (error) {
            this._handleProviderError(error, 'getTransactionStatus');
        }
    }

    async getProviders({ tId, tSum, tUrl }) {
        try {
            const response = await this.httpClient.get('/api/gateway/gateways', {
                params: { t_id: tId, t_sum: tSum, t_url: tUrl }
            });
            const data = response.data;

            if (data.status !== 'SUCCESS') {
                throw new AppError(data.message || 'Failed to get providers from PayUnit', 502);
            }

            return data.data || [];
        } catch (error) {
            this._handleProviderError(error, 'getProviders');
        }
    }

    parseWebhookPayload(payload) {
        if (!payload) {
            throw new BadRequestError('Invalid PayUnit webhook payload: payload is empty');
        }

        const txData = payload.data || payload;

        if (!txData.transaction_id) {
            throw new BadRequestError('Invalid PayUnit webhook payload: missing transaction_id');
        }

        return {
            transactionId: txData.transaction_id,
            status: this._normalizeStatus(txData.transaction_status),
            providerStatus: txData.transaction_status,
            amount: txData.transaction_amount,
            currency: txData.transaction_currency,
            gateway: txData.transaction_gateway,
            message: txData.message,
            rawPayload: payload
        };
    }

    _normalizeStatus(providerStatus) {
        const statusMap = {
            'SUCCESS': 'success',
            'PENDING': 'pending',
            'CANCELLED': 'cancelled',
            'INITIATED': 'initiated',
            'FAILED': 'failed'
        };
        return statusMap[providerStatus] || 'unknown';
    }

    _handleProviderError(error, methodName) {
        if (error instanceof AppError) throw error;
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.message || `PayUnit ${methodName} failed`;
            logger.error(`PayUnit Error (${status}) during ${methodName}:`, {
                data: error.response.data,
                headers: error.response.headers,
                status: error.response.status
            });
            if (status === 400) throw new BadRequestError(message);
            throw new AppError(`PayUnit API error: ${message}`, 502);
        }
        logger.error(`PayUnit Connection Error during ${methodName}:`, error.message);
        throw new AppError(`PayUnit service unavailable: ${error.message}`, 503);
    }
}

module.exports = PayunitProvider;
