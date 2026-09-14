-- Migration: Add payment finalization tracking columns
-- Adds columns to track when an admin finalizes a payment

ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS payment_finalized_by  INTEGER REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS payment_finalized_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_transaction_id BIGINT REFERENCES payment_transactions(id);

-- Index for quick lookups of finalized payments
CREATE INDEX IF NOT EXISTS idx_payroll_payment_finalized ON payroll_records(payment_finalized_at);

-- Comment documenting the new columns
COMMENT ON COLUMN payroll_records.payment_finalized_by IS 'Admin ID who finalized the payment';
COMMENT ON COLUMN payroll_records.payment_finalized_at IS 'Timestamp when payment was finalized';
COMMENT ON COLUMN payroll_records.payment_transaction_id IS 'Reference to the payment transaction record';
