require('dotenv').config();
const db = require('./src/config/database');

async function run() {
  try {
    await db.query(`
      ALTER TABLE payroll_records
      ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES admins(id),
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS bulk_request_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS approval_notes TEXT,
      ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES admins(id),
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    `);
    console.log("Migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit(0);
  }
}

run();
