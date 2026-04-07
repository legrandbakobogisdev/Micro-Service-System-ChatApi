const DeviceRegistry = require('../models/DeviceRegistry');
const ContactMapping = require('../models/ContactMapping');
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
     * Handle chat reception
     */
    static async handleChatMessage(data) {
        const { senderId, participants, content, type, conversationId, groupName, mutedBy } = data;
        
        if (!participants || !Array.isArray(participants)) return;

        try {
            // Determine a clean preview text safely
            let messagePreview = (typeof content === 'string' && content.length > 50) ? content.substring(0, 50) + '...' : content;
            if (type === 'image') messagePreview = '📷 Photo';
            else if (type === 'video') messagePreview = '🎥 Video';
            else if (type === 'audio') messagePreview = '🎤 Audio message';
            else if (type === 'document') messagePreview = '📄 Document';
            else if (type === 'system') messagePreview = content;

            const title = groupName ? `New message in ${groupName}` : 'New Message';

            // Send notification to all participants except the sender
            for (const participantId of participants) {
                // Skip sender
                if (participantId.toString() === senderId.toString()) continue;
                
                // Skip if participant has muted this conversation
                if (mutedBy && mutedBy.includes(participantId.toString())) continue;
                
                await PushService.sendToUser(participantId.toString(), {
                    title,
                    body: messagePreview || 'New message attached',
                    data: { conversationId, senderId, type: 'chat_message' }
                }, 'chat');
            }
        } catch (error) {
            logger.error(`Failed to notify message in conversation ${conversationId}:`, error);
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

    /**
     * Handle contacts synced event from auth-service
     * Maps phone numbers to users who have them in their contacts.
     */
    static async handleContactsSynced(data) {
        const { userId, syncedContacts } = data;
        if (!syncedContacts || !Array.isArray(syncedContacts)) return;

        try {
            logger.info(`Processing contact sync for user ${userId} (${syncedContacts.length} numbers)`);
            
            // Bulk upsert mappings
            const operations = syncedContacts.map(phone => ({
                updateOne: {
                    filter: { phone, researcherUserId: userId },
                    update: { $set: { lastSyncedAt: new Date() } },
                    upsert: true
                }
            }));

            if (operations.length > 0) {
                await ContactMapping.bulkWrite(operations);
            }
        } catch (error) {
            logger.error(`Failed to handle chat.contacts_synced for user ${userId}:`, error);
        }
    }

    /**
     * Handle user.created event from auth-service
     * Notifies all "researchers" who have this new user's phone in their contacts.
     */
    static async handleUserCreated(data) {
        const { userId, phoneNumber, firstName, lastName, username } = data;
        if (!phoneNumber) return;

        try {
            logger.info(`New user created: ${userId} (${phoneNumber}). Notifying contacts...`);
            
            // Find everyone who has this phone number in their synced contacts
            const observers = await ContactMapping.find({ phone: phoneNumber }).select('researcherUserId');
            
            if (observers.length === 0) return;

            const name = firstName || username || 'A contact';
            const title = 'User Joined ChatApp! 📱';
            const body = `${name} is now on ChatApp! Start a conversation.`;

            // Notify everyone
            for (const observer of observers) {
                const targetUserId = observer.researcherUserId.toString();
                // Don't notify the user about themselves (if for some reason they have their own number)
                if (targetUserId === userId.toString()) continue;

                await PushService.sendToUser(targetUserId, {
                    title,
                    body,
                    data: { action: 'open_chat', targetUserId: userId }
                }, 'chat');
            }
            
            logger.info(`Notified ${observers.length} users that ${phoneNumber} joined.`);
        } catch (error) {
            logger.error(`Failed to notify contacts for new user ${userId}:`, error);
        }
    }
}

module.exports = EventHandler;
