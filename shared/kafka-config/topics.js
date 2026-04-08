const TOPICS = {
    // User Events
    USER_CREATED: 'user.created',
    USER_UPDATED: 'user.updated',
    USER_DELETED: 'user.deleted',
    USER_VERIFIED: 'user.verified',
    USER_LOGGED_IN: 'user.logged_in',
    DEVICE_REGISTERED: 'device.registered',
    USER_BLOCKED: 'user.blocked',
    USER_UNBLOCKED: 'user.unblocked',

    // Chat Events
    CHAT_MESSAGE_SENT: 'chat.message_sent',
    CHAT_MESSAGE_UPDATED: 'chat.message_updated',
    CHAT_MESSAGE_DELIVERED: 'chat.message_delivered',
    CHAT_MESSAGES_DELIVERED: 'chat.messages_delivered',
    CHAT_MESSAGE_READ: 'chat.message_read',
    CHAT_MESSAGE_DELETED: 'chat.message_deleted',
    CHAT_MESSAGES_READ_ALL: 'chat.messages_read_all',
    CHAT_GROUP_CREATED: 'chat.group_created',
    CHAT_GROUP_UPDATED: 'chat.group_updated',
    CHAT_TYPING: 'chat.typing',
    CHAT_CONTACTS_SYNCED: 'chat.contacts_synced',
    CHAT_NOTIFICATION_REPLY: 'chat.notification_reply',
    CHAT_NOTIFICATION_MARK_READ: 'chat.notification_mark_read',

    // Notification Events
    NOTIFICATION_PUSH: 'notification.push',
    NOTIFICATION_EMAIL: 'notification.email',
    NOTIFICATION_IN_APP: 'notification.in_app',

    // Media Events
    MEDIA_UPLOADED: 'media.uploaded',
    MEDIA_DELETED: 'media.deleted',

    // Story Events
    STORY_CREATED: 'story.created',
    STORY_VIEWED: 'story.viewed',
    STORY_DELETED: 'story.deleted',

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
