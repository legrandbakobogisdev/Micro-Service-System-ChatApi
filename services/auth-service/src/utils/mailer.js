const nodemailer = require('nodemailer');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('auth-mailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Send OTP email
 * @param {string} email - Recipient email
 * @param {string} code - 6-digit code
 */
exports.sendOTP = async (email, code) => {
    // Format: SX-xxx-xxx
    const formattedCode = `SX-${code.substring(0, 3)}-${code.substring(3)}`;
    
    const mailOptions = {
        from: `"SangoX Auth" <${process.env.SMTP_FROM || 'noreply@sangox.com'}>`,
        to: email,
        subject: 'Votre code de connexion SangoX',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #007bff; text-align: center;">SangoX</h2>
                <p>Hello,</p>
                <p>Voici votre code de vérification à 6 chiffres pour vous connecter ou créer votre compte :</p>
                <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; margin: 20px 0; border-radius: 5px;">
                    ${formattedCode}
                </div>
                <p>Ce code expirera dans 15 minutes. Ne le partagez avec personne.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #777; text-align: center;">Si vous n'avez pas demandé ce code, vous pouvez ignorer cet e-mail.</p>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logger.info(`OTP email sent to ${email}: ${info.messageId}`);
        return true;
    } catch (error) {
        logger.error(`Error sending OTP email to ${email}:`, error);
        throw new Error('Failed to send verification email');
    }
};
