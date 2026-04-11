const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    transactionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    providerTransactionId: {
        type: String,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    orderId: {
        type: String,
        index: true
    },
    type: {
        type: String,
        enum: ['collection', 'payout', 'invoice'],
        default: 'collection'
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'XAF'
    },
    status: {
        type: String,
        enum: ['initiated', 'pending', 'success', 'failed', 'cancelled'],
        default: 'initiated'
    },
    gateway: {
        type: String
    },
    provider: {
        type: String,
        default: 'payunit'
    },
    phoneNumber: {
        type: String
    },
    returnUrl: {
        type: String
    },
    notifyUrl: {
        type: String
    },
    transactionUrl: {
        type: String
    },
    errorMessage: {
        type: String
    },
    providerResponse: {
        type: Object
    },
    webhookData: {
        type: Object
    },
    metadata: {
        type: Object
    }
}, {
    timestamps: true
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
