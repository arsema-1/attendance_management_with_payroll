-- ============================================================
-- Payroll Approval Workflow Migration
-- HR submits → Admin approves → Payment processing
-- ============================================================

-- Add approval tracking columns to payroll_records
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS bulk_request_id VARCHAR(50);

-- Index for quick lookups of pending approvals
CREATE INDEX IF NOT EXISTS idx_payroll_approval_status
  ON payroll_records(approval_status) WHERE approval_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_bulk_request
  ON payroll_records(bulk_request_id) WHERE bulk_request_id IS NOT NULL;

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  related_id BIGINT,
  related_type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_admin
  ON notifications(admin_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(admin_id) WHERE is_read = FALSE;

-- Trigger for notifications updated_at (if needed in future)
CREATE OR REPLACE FUNCTION update_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at = NEW.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
