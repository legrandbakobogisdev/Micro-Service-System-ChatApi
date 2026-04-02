#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate cryptographically secure secrets for the marketplace platform
 */

/**
 * Generate a secure random secret
 * @param {number} bytes - Number of bytes (default: 64)
 * @returns {string} Hex-encoded secret
 */
function generateSecret(bytes = 64) {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a secure password
 * @param {number} length - Password length (default: 32)
 * @returns {string} Alphanumeric password
 */
function generatePassword(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
        password += chars[bytes[i] % chars.length];
    }

    return password;
}

/**
 * Generate all secrets
 */
function generateAllSecrets(defaultDbPassword = null) {
    console.log('\n' + '='.repeat(60));
    console.log('🔐 MICROSERVICES - SECRET GENERATOR');
    console.log('='.repeat(60) + '\n');

    const dbPassword = defaultDbPassword || generatePassword(32);

    // Load existing secrets to avoid overwriting real ones
    const secretsPath = path.join(__dirname, '..', '.secrets.env');
    let existingSecrets = {};
    if (fs.existsSync(secretsPath)) {
        const content = fs.readFileSync(secretsPath, 'utf-8');
        content.split('\n').forEach(line => {
            const index = line.indexOf('=');
            if (index > 0) {
                const key = line.substring(0, index).trim();
                const value = line.substring(index + 1).trim();
                if (key && value) existingSecrets[key] = value;
            }
        });
    }

    const secrets = {
        // JWT Secrets
        JWT_ACCESS_SECRET: existingSecrets.JWT_ACCESS_SECRET || generateSecret(64),
        JWT_REFRESH_SECRET: existingSecrets.JWT_REFRESH_SECRET || generateSecret(64),

        // MongoDB Passwords
        MONGODB_PASSWORD_AUTH: existingSecrets.MONGODB_PASSWORD_AUTH || dbPassword,
        MONGODB_PASSWORD_SUBSCRIPTION: existingSecrets.MONGODB_PASSWORD_SUBSCRIPTION || dbPassword,
        MONGODB_PASSWORD_PAYMENT: existingSecrets.MONGODB_PASSWORD_PAYMENT || dbPassword,
        MONGODB_PASSWORD_NOTIFICATION: existingSecrets.MONGODB_PASSWORD_NOTIFICATION || dbPassword,
        MONGODB_PASSWORD_ANALYTICS: existingSecrets.MONGODB_PASSWORD_ANALYTICS || dbPassword,
        MONGODB_PASSWORD_SUPPORT: existingSecrets.MONGODB_PASSWORD_SUPPORT || dbPassword,
        MONGODB_PASSWORD_MEDIA: existingSecrets.MONGODB_PASSWORD_MEDIA || dbPassword,
        MONGODB_PASSWORD_CHAT: existingSecrets.MONGODB_PASSWORD_CHAT || dbPassword,
        MONGODB_PASSWORD: existingSecrets.MONGODB_PASSWORD || dbPassword,

        // Redis Password
        REDIS_PASSWORD: existingSecrets.REDIS_PASSWORD || generatePassword(32),

        // API Keys (Only overwrite if placeholder)
        STRIPE_SECRET_KEY: (!existingSecrets.STRIPE_SECRET_KEY || existingSecrets.STRIPE_SECRET_KEY.includes('sk_test')) ? `sk_test_${generateSecret(32)}` : existingSecrets.STRIPE_SECRET_KEY,
        PAYPAL_CLIENT_SECRET: (!existingSecrets.PAYPAL_CLIENT_SECRET || existingSecrets.PAYPAL_CLIENT_SECRET.length < 20) ? generateSecret(32) : existingSecrets.PAYPAL_CLIENT_SECRET,
        AWS_SECRET_ACCESS_KEY: (!existingSecrets.AWS_SECRET_ACCESS_KEY || existingSecrets.AWS_SECRET_ACCESS_KEY.includes('your')) ? generateSecret(40) : existingSecrets.AWS_SECRET_ACCESS_KEY,
        TWILIO_AUTH_TOKEN: (!existingSecrets.TWILIO_AUTH_TOKEN || existingSecrets.TWILIO_AUTH_TOKEN.includes('your')) ? generateSecret(32) : existingSecrets.TWILIO_AUTH_TOKEN,

        // Session & Encryption
        SESSION_SECRET: existingSecrets.SESSION_SECRET || generateSecret(64),
        ENCRYPTION_KEY: existingSecrets.ENCRYPTION_KEY || generateSecret(32),

        // Cloudinary Configuration
        CLOUDINARY_CLOUD_NAME: existingSecrets.CLOUDINARY_CLOUD_NAME || 'your-cloud-name',
        CLOUDINARY_API_KEY: existingSecrets.CLOUDINARY_API_KEY || 'your-api-key',
        CLOUDINARY_API_SECRET: existingSecrets.CLOUDINARY_API_SECRET || 'your-api-secret',
    };

    // Display secrets (Masked)
    console.log('✅ Updated Secrets (Sensitive values masked):\n');

    Object.entries(secrets).forEach(([key, value]) => {
        const isSensitive = key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD') || key.includes('PRIVATE');
        const displayValue = isSensitive ? '********' : (value.length > 50 ? `${value.substring(0, 47)}...` : value);
        console.log(`${key}: ${displayValue}`);
    });

    const content = Object.entries(secrets)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    fs.writeFileSync(secretsPath, content + '\n');

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Secrets saved to: .secrets.env`);
    console.log('='.repeat(60));

    console.log('\n⚠️  SECURITY WARNING:');
    console.log('  - Keep .secrets.env file secure and private');
    console.log('  - Never commit this file to version control');
    console.log('  - Add .secrets.env to .gitignore');
    console.log('  - Copy values to your service .env files\n');

    return secrets;
}

/**
 * Generate a single JWT secret (for CLI usage)
 */
function generateJWTSecret() {
    const secret = generateSecret(64);
    console.log(secret);
    return secret;
}

// Run if called directly
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--jwt-only')) {
        generateJWTSecret();
    } else {
        const dbPassArg = args.find(arg => arg.startsWith('--db-password='));
        const defaultDbPassword = dbPassArg ? dbPassArg.split('=')[1] : null;
        generateAllSecrets(defaultDbPassword);
    }
}

module.exports = { generateSecret, generatePassword, generateAllSecrets, generateJWTSecret };
