-- Migration: Fix payment_submitted_by column type
-- The column was incorrectly created as VARCHAR(20) instead of INTEGER.
-- This converts it to INTEGER to match the code and other payment columns.

-- First, check if the column exists and is the wrong type
-- Then alter it to INTEGER

DO $$
DECLARE
  col_type TEXT;
BEGIN
  -- Check current type of payment_submitted_by
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'payroll_records'
    AND column_name = 'payment_submitted_by';

  IF col_type = 'character varying' THEN
    -- Column exists as VARCHAR - alter it to INTEGER
    -- Note: this assumes all existing values are valid integers or NULL
    EXECUTE 'ALTER TABLE payroll_records ALTER COLUMN payment_submitted_by TYPE INTEGER USING NULLIF(payment_submitted_by,'''')::INTEGER';
    RAISE NOTICE 'Fixed payment_submitted_by: VARCHAR → INTEGER';
  ELSIF col_type = 'integer' THEN
    RAISE NOTICE 'payment_submitted_by is already INTEGER, no change needed';
  ELSE
    RAISE NOTICE 'payment_submitted_by type is "%" - manual review needed', col_type;
  END IF;
END $$;
