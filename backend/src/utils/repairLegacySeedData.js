const db = require('../config/database');

// Earlier copies of schema.sql accidentally inserted Markdown links instead
// of email addresses, together with a hash that did not match Admin@1234.
// Repair only those exact legacy sample rows; accounts created by users are
// never touched.
const LEGACY_HASH = '$2b$12$LCv3c1yqBwWhxkd0LHAkCOYZ6TtxMQJqHn8/LewYpFQN5nw6Y5mBy';
const DEFAULT_HASH = '$2b$12$FuaEMgyOTROcW6O0.EJsWeHwtmgjy5HoaOQpUjYzezq0Q.YRpEi7C';

const legacyEmployees = [
  ['MKA-001', '[rahul@company.com](mailto:rahul@company.com)', 'rahul@company.com'],
  ['MKA-002', '[priya@company.com](mailto:priya@company.com)', 'priya@company.com'],
];

async function repairLegacySeedData() {
  for (const [employeeId, legacyEmail, email] of legacyEmployees) {
    await db.query(
      `UPDATE employees
       SET email = $1, password_hash = $2, updated_at = NOW()
       WHERE employee_id = $3 AND email = $4 AND password_hash = $5`,
      [email, DEFAULT_HASH, employeeId, legacyEmail, LEGACY_HASH]
    );
  }
}

module.exports = repairLegacySeedData;
