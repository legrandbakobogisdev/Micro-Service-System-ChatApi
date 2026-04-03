const TOPICS = {
    // User Events
    USER_CREATED: 'user.created',
    USER_UPDATED: 'user.updated',
    USER_DELETED: 'user.deleted',
    USER_VERIFIED: 'user.verified',
    USER_LOGGED_IN: 'user.logged_in',

    // Chat Events
    CHAT_MESSAGE_SENT: 'chat.message_sent',
    CHAT_MESSAGE_DELIVERED: 'chat.message_delivered',
    CHAT_MESSAGE_READ: 'chat.message_read',
    CHAT_MESSAGE_DELETED: 'chat.message_deleted',
    CHAT_GROUP_CREATED: 'chat.group_created',
    CHAT_GROUP_UPDATED: 'chat.group_updated',
    CHAT_TYPING: 'chat.typing',

    // Notification Events
    NOTIFICATION_PUSH: 'notification.push',
    NOTIFICATION_EMAIL: 'notification.email',
    NOTIFICATION_IN_APP: 'notification.in_app',

    // Media Events
    MEDIA_UPLOADED: 'media.uploaded',
    MEDIA_DELETED: 'media.deleted',

    // Presence Events
    USER_ONLINE: 'presence.online',
    USER_OFFLINE: 'presence.offline',

    // Session Events
    SESSION_REVOKED: 'auth.session_revoked',

    // Payment Events
    PAYMENT_INITIATED: 'payment.initiated',
    PAYMENT_SUCCESS: 'payment.success',
    PAYMENT_FAILED: 'payment.failed',

    // Subscription Events
    SUBSCRIPTION_CREATED: 'subscription.created',
    SUBSCRIPTION_EXPIRED: 'subscription.expired',

    // Analytics Events
    ANALYTICS_EVENT: 'analytics.event',

    // Support Events
    TICKET_CREATED: 'ticket.created',
    TICKET_UPDATED: 'ticket.updated'
};

function getAllTopics() { return Object.values(TOPICS); }

function getTopicsByCategory(category) {
    const prefix = category.toUpperCase();
    return Object.entries(TOPICS).filter(([key]) => key.startsWith(prefix)).map(([, value]) => value);
}

module.exports = { TOPICS, getAllTopics, getTopicsByCategory };
