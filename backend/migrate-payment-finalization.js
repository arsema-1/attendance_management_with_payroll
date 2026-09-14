// Force SSL to false for local connections
process.env.DB_SSL = 'false';

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    // Add payment finalization columns
    await client.query(`
      ALTER TABLE payroll_records
        ADD COLUMN IF NOT EXISTS payment_finalized_by  INTEGER REFERENCES admins(id),
        ADD COLUMN IF NOT EXISTS payment_finalized_at  TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS payment_transaction_id BIGINT REFERENCES payment_transactions(id)
    `);
    
    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payroll_payment_finalized ON payroll_records(payment_finalized_at)
    `);
    
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
