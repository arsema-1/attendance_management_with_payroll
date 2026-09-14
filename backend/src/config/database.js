const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const useSSL = process.env.DB_SSL === 'true';

// Local PostgreSQL often does not require SSL, while managed providers like
// Supabase do. Only enable SSL when explicitly configured.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('connect', () => logger.info('✅ DB connection acquired from pool'));
pool.on('error',   (err) => logger.error('❌ Idle DB client error:', err.message));

// Convenience wrapper — all controllers call db.query(sql, params)
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
