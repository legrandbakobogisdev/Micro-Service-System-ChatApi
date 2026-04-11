module.exports = {
    apiKey: process.env.PAYUNIT_API_KEY,
    apiUsername: process.env.PAYUNIT_API_USERNAME,
    apiPassword: process.env.PAYUNIT_API_PASSWORD,
    mode: process.env.PAYUNIT_MODE || 'test',
    baseURL: process.env.PAYUNIT_BASE_URL || 'https://gateway.payunit.net',
    defaultCurrency: 'XAF',
    defaultCountry: 'CM'
};
