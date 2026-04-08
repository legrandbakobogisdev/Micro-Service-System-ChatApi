const { admin } = require('../config/firebase');
const DeviceRegistry = require('../models/DeviceRegistry');
const Notification = require('../models/Notification');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('notification-service');

class PushService {
    /**
     * Send push notification to a user (across all their registered devices)
     * @param {string} userId - Target User ID
     * @param {object} payload - Title, body, and optional data
     * @param {string} type - Notification type (auth, chat, etc.)
     */
    static async sendToUser(userId, { title, body, data = {} }, type = 'system') {
        try {
            // 1. Fetch devices for user
            const devices = await DeviceRegistry.find({ userId, isActive: true });
            
            if (!devices.length) {
                logger.info(`No active devices found for user ${userId}, skipping push.`);
                return false;
            }

            // Filter out devices without valid FCM tokens
            const validDevices = devices.filter(d => d.fcmToken && d.fcmToken.trim());
            
            if (!validDevices.length) {
                logger.warn(`No valid FCM tokens found for user ${userId}`);
                return false;
            }

            const tokens = validDevices.map(d => d.fcmToken);
            
            // 2. Persist notification in DB (History)
            await Notification.create({ userId, title, body, type, data });

            // 3. Construct FCM multicast message
            const messageData = { ...data, type, click_action: 'FLUTTER_NOTIFICATION_CLICK' };
            
            // Add categoryIdentifier for iOS notification categories
            if (type === 'chat') {
                messageData.categoryIdentifier = 'message';
                // Add action hints in data for client to handle
                messageData.actions = JSON.stringify([
                    { action: 'REPLY', title: 'Reply' },
                    { action: 'MARK_AS_READ', title: 'Mark as read' }
                ]);
            }
            
            // Build notification payload
            const notificationPayload = { title, body };
            
            // Add Android-specific config for chat notifications
            let androidConfig = null;
            if (type === 'chat') {
                androidConfig = {
                    priority: 'high',
                    notification: {
                        title,
                        body,
                        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                        tag: data.conversationId // Group notifications by conversation
                    }
                };
            }
            
            // Build APNS config for iOS
            let apnsConfig = null;
            if (type === 'chat') {
                apnsConfig = {
                    headers: {
                        'apns-priority': '10'
                    },
                    payload: {
                        aps: {
                            alert: {
                                title,
                                body
                            },
                            badge: 1,
                            sound: 'default',
                            category: 'MESSAGE_CATEGORY',
                            'mutable-content': 1
                        }
                    }
                };
            }
            
            const message = {
                notification: notificationPayload,
                data: messageData,
                tokens: tokens,
                ...(androidConfig && { android: androidConfig }),
                ...(apnsConfig && { apns: apnsConfig })
            };

            // 4. Send via Firebase (only if we have valid tokens)
            if (!tokens || tokens.length === 0) {
                logger.warn(`No valid tokens to send for user ${userId}`);
                return false;
            }

            if (admin.apps.length > 0) {
                const response = await admin.messaging().sendEachForMulticast(message);
                
                // 5. Cleanup invalid tokens
                if (response.failureCount > 0) {
                    const failedTokens = [];
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success) {
                            if (resp.error.code === 'messaging/invalid-registration-token' || 
                                resp.error.code === 'messaging/registration-token-not-registered') {
                                failedTokens.push(tokens[idx]);
                            }
                            logger.error(`FCM error for token ${tokens[idx]}:`, resp.error);
                        }
                    });

                    if (failedTokens.length) {
                        await DeviceRegistry.updateMany(
                            { fcmToken: { $in: failedTokens } },
                            { isActive: false, lastUpdated: new Date() }
                        );
                        logger.info(`Deactivated ${failedTokens.length} invalid tokens for user ${userId}`);
                    }
                }

                logger.info(`Successfully sent ${response.successCount} push notifications to user ${userId}`);
            } else {
                logger.warn(`Firebase not initialized, push notification suppressed for user ${userId}`);
            }

            return true;
        } catch (error) {
            logger.error(`Failed to send push notification to user ${userId}:`, error);
            return false;
        }
    }
}

module.exports = PushService;
