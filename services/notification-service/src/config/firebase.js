const admin = require('firebase-admin');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('notification-service');

const initializeFirebase = () => {
    try {
        if (admin.apps.length === 0) {
            // Try loading from service account file first
            const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
            
            if (serviceAccountPath && require('fs').existsSync(serviceAccountPath)) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccountPath)
                });
                logger.info('Firebase Admin initialized via Service Account File');
            } else if (process.env.FIREBASE_PROJECT_ID) {
                // Fallback to environment variables
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                    })
                });
                logger.info('Firebase Admin initialized via Environment Variables');
            } else {
                logger.warn('Firebase configuration missing. Push notifications will be disabled.');
            }
        }
        return admin;
    } catch (error) {
        logger.error('Failed to initialize Firebase Admin:', error);
        return null;
    }
};

module.exports = { initializeFirebase, admin };
