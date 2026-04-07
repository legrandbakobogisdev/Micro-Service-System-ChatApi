const { parsePhoneNumberFromString } = require('libphonenumber-js');

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - The raw phone number
 * @param {string} defaultRegion - Default country code (e.g., 'CM' for Cameroon)
 * @returns {string|null} - Normalized number or null if invalid
 */
const normalizePhoneNumber = (phone, defaultRegion = 'CM') => {
    if (!phone) return null;
    
    try {
        const phoneNumber = parsePhoneNumberFromString(phone, defaultRegion);
        if (phoneNumber && phoneNumber.isValid()) {
            return phoneNumber.format('E.164'); // Returns +237699123456
        }
        return null;
    } catch (error) {
        return null;
    }
};

module.exports = { normalizePhoneNumber };
