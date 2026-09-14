-- ============================================================
-- Chapa Payment Integration Migration
-- Run this against an existing DB that was created from the
-- original schema.sql (before bank info was added).
-- Safe to re-run — all statements use IF NOT EXISTS / IF NOT EXISTS guards.
-- ============================================================

-- 1. Add bank account columns to employees table
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_name       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_code       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS account_number  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS account_name    VARCHAR(150);

-- 2. Add payment tracking columns to payroll_records
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS payment_submitted_by  INTEGER REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS payment_submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_initiated_by  INTEGER REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS payment_initiated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_notes         TEXT;

-- 3. Payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                BIGSERIAL PRIMARY KEY,
  payroll_id        BIGINT NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  employee_id       VARCHAR(20) NOT NULL REFERENCES employees(employee_id),
  tx_ref            VARCHAR(100) NOT NULL UNIQUE,
  chapa_transfer_id VARCHAR(150),
  amount            NUMERIC(12,2) NOT NULL,
  currency          VARCHAR(10) DEFAULT 'ETB',
  account_number    VARCHAR(50),
  account_name      VARCHAR(150),
  bank_code         VARCHAR(20),
  bank_name         VARCHAR(100),
  status            VARCHAR(20) DEFAULT 'pending',  -- pending | successful | failed
  chapa_status      VARCHAR(50),
  failure_reason    TEXT,
  initiated_by      INTEGER REFERENCES admins(id),
  initiated_at      TIMESTAMPTZ DEFAULT NOW(),
  verified_at       TIMESTAMPTZ,
  raw_response      JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptx_payroll  ON payment_transactions(payroll_id);
CREATE INDEX IF NOT EXISTS idx_ptx_employee ON payment_transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_ptx_tx_ref   ON payment_transactions(tx_ref);
CREATE INDEX IF NOT EXISTS idx_ptx_status   ON payment_transactions(status);

-- 4. Add updated_at triggers if missing (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payroll_update'
  ) THEN
    CREATE TRIGGER trg_payroll_update
    BEFORE UPDATE ON payroll_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_update'
  ) THEN
    CREATE TRIGGER trg_leave_update
    BEFORE UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

-- 5. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  admin_id     INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  message      TEXT,
  related_type VARCHAR(50),
  related_id   INTEGER,
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_admin  ON notifications(admin_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(admin_id, is_read);
