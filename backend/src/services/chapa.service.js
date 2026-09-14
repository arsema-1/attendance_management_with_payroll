
const axios = require('axios');
const { logger } = require('../utils/logger');

const BASE_URL   = process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1';
const SECRET_KEY = process.env.CHAPA_SECRET_KEY;

function assertValidSecretKey() {
  if (!SECRET_KEY) {
    throw new Error(
      'CHAPA_SECRET_KEY is not set. Copy backend/.env.example to .env and add your secret key from dashboard.chapa.co → Settings → API.'
    );
  }
  if (SECRET_KEY.startsWith('CHAPUBK')) {
    throw new Error(
      'CHAPA_SECRET_KEY looks like a public key (CHAPUBK…). Use your secret key (CHASECK_TEST-… or CHASECK-…) instead.'
    );
  }
  if (!SECRET_KEY.startsWith('CHASECK')) {
    logger.warn('CHAPA_SECRET_KEY does not start with CHASECK — Chapa API calls may fail.');
  }
}

const chapaClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
});

function beforeRequest() {
  assertValidSecretKey();
}

/**
 * Initiate a bank transfer via Chapa
 * @param {object} payload
 * @param {string} payload.account_name   - Recipient account holder name
 * @param {string} payload.account_number - Bank account number
 * @param {string} payload.bank_code      - Chapa bank code
 * @param {number} payload.amount         - Amount in ETB
 * @param {string} payload.tx_ref         - Unique reference (our internal ID)
 * @param {string} [payload.reference]    - Optional narration
 * @returns {Promise<object>} Chapa API response data
 */
async function initiateTransfer(payload) {
  beforeRequest();
  const body = {
    account_name:   payload.account_name,
    account_number: payload.account_number,
    bank_code:      payload.bank_code,
    amount:         String(payload.amount),
    currency:       'ETB',
    reference:      payload.tx_ref,
    narration:      payload.reference || `Salary payment ref ${payload.tx_ref}`,
  };

  const response = await chapaClient.post('/transfers', body);
  return response.data;
}

/**
 * Verify a transfer by its tx_ref
 * @param {string} txRef
 * @returns {Promise<object>} Chapa API response data
 */
async function verifyTransfer(txRef) {
  beforeRequest();
  const response = await chapaClient.get(`/transfers/verify/${txRef}`);
  return response.data;
}

/**
 * Get list of banks supported by Chapa
 */
async function getBanks() {
  beforeRequest();
  const response = await chapaClient.get('/banks');
  return response.data;
}

module.exports = { initiateTransfer, verifyTransfer, getBanks };
