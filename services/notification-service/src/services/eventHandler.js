const DeviceRegistry = require('../models/DeviceRegistry');
const PushService = require('./pushService');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('notification-service');

class EventHandler {
    /**
     * Handle device.registered event from auth-service
     */
    static async handleDeviceRegistered(data) {
        const { userId, deviceId, fcmToken, deviceInfo } = data;
        try {
            await DeviceRegistry.findOneAndUpdate(
                { userId, deviceId },
                { fcmToken, deviceInfo, isActive: true, lastUpdated: new Date() },
                { upsert: true, new: true }
            );
            logger.info(`Device registered for user ${userId}: ${deviceId}`);
        } catch (error) {
            logger.error(`Failed to handle device.registered for user ${userId}:`, error);
        }
    }

    /**
     * Handle user.logged_in event from auth-service (check for new device)
     */
    static async handleUserLoggedIn(data) {
        const { userId, deviceId, userAgent, ip } = data;
        try {
            // Logic to check if this device was already registered
            const existing = await DeviceRegistry.findOne({ userId, deviceId });
            if (!existing) {
                // Potential new device login - notify other active devices
                await PushService.sendToUser(userId, {
                    title: 'Security Alert: New Login',
                    body: `A new login was detected from device ${deviceId} (${userAgent}) at ${ip}.`,
                    data: { action: 'security_check' }
                }, 'auth');
                logger.info(`Notified user ${userId} of login from new device ${deviceId}`);
            }
        } catch (error) {
            logger.error(`Error handling user.logged_in for user ${userId}:`, error);
        }
    }

    /**
     * Handle chat reception (placeholder)
     */
    static async handleChatMessage(data) {
        const { senderId, receiverId, messagePreview, chatId } = data;
        try {
            await PushService.sendToUser(receiverId, {
                title: 'New Message',
                body: `${messagePreview}`,
                data: { chatId, senderId }
            }, 'chat');
        } catch (error) {
            logger.error(`Failed to notify message for user ${receiverId}:`, error);
        }
    }

    /**
     * Handle payment events
     */
    static async handlePaymentEvent(data) {
        const { userId, status, orderId } = data;
        let title = 'Payment Update';
        let body = `Your payment for order ${orderId} is ${status}.`;

        if (status === 'success') {
            title = 'Payment Successful ✅';
            body = `Order ${orderId} has been paid successfully.`;
        } else if (status === 'failed') {
            title = 'Payment Failed ❌';
            body = `Order ${orderId} payment failed. Please try again.`;
        }

        await PushService.sendToUser(userId, { title, body, data: { orderId } }, 'payment');
    }

    /**
     * Handle subscription reminders / status
     */
    static async handleSubscriptionEvent(data) {
        const { userId, planName, eventType, daysLeft } = data;
        let title = 'Subscription Update';
        let body = `Your ${planName} subscription status: ${eventType}.`;

        if (eventType === 'expiry_reminder') {
            title = 'Subscription Expiring Soon ⏳';
            body = `Your ${planName} subscription expires in ${daysLeft} days. Renew now to avoid interruption.`;
        } else if (eventType === 'expired') {
            title = 'Subscription Expired 🚫';
            body = `Your ${planName} subscription has expired.`;
        }

        await PushService.sendToUser(userId, { title, body, data: { planName } }, 'subscription');
    }

    /**
     * Handle support messages
     */
    static async handleSupportMessage(data) {
        const { userId, ticketId, message } = data;
        await PushService.sendToUser(userId, {
            title: 'Support Response',
            body: `You have a new response on ticket ${ticketId}`,
            data: { ticketId }
        }, 'support');
    }
}

module.exports = EventHandler;
