-- ============================================================
-- QR Attendance & Workforce Management System
-- PostgreSQL 15+ Production Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DEPARTMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
id SERIAL PRIMARY KEY,
name VARCHAR(100) NOT NULL UNIQUE,
manager_id VARCHAR(20),
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EMPLOYEES
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
employee_id VARCHAR(20) PRIMARY KEY,
full_name VARCHAR(150) NOT NULL,
email VARCHAR(255) UNIQUE NOT NULL,
phone VARCHAR(20) UNIQUE NOT NULL,
department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
designation VARCHAR(100),
date_of_joining DATE NOT NULL,
base_salary NUMERIC(12,2) DEFAULT 0,
password_hash VARCHAR(255) NOT NULL,

casual_leave_balance INTEGER DEFAULT 12,
sick_leave_balance INTEGER DEFAULT 10,
paid_leave_balance INTEGER DEFAULT 15,

is_active BOOLEAN DEFAULT TRUE,
profile_photo_url TEXT,

-- Bank / Chapa payment info
bank_name       VARCHAR(100),
bank_code       VARCHAR(20),
account_number  VARCHAR(50),
account_name    VARCHAR(150),

created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_email ON employees(email);
CREATE INDEX idx_employee_phone ON employees(phone);
CREATE INDEX idx_employee_dept ON employees(department_id);

-- ============================================================
-- ADMIN USERS
-- ============================================================

CREATE TYPE admin_role AS ENUM ('super_admin','hr_admin','hr_officer','viewer');

CREATE TABLE IF NOT EXISTS admins (
id SERIAL PRIMARY KEY,
name VARCHAR(150) NOT NULL,
email VARCHAR(255) UNIQUE NOT NULL,
password_hash VARCHAR(255) NOT NULL,
role admin_role DEFAULT 'hr_admin',
is_active BOOLEAN DEFAULT TRUE,
last_login_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE
-- ============================================================

CREATE TYPE attendance_method AS ENUM ('qr','face','manual','offline_sync');
CREATE TYPE attendance_status AS ENUM ('present','absent','leave','holiday','half_day');

CREATE TABLE IF NOT EXISTS attendance (
id BIGSERIAL PRIMARY KEY,

employee_id VARCHAR(20) REFERENCES employees(employee_id) ON DELETE CASCADE,
date DATE NOT NULL,

check_in_time TIMESTAMPTZ,
check_out_time TIMESTAMPTZ,

working_minutes INTEGER DEFAULT 0,
overtime_minutes INTEGER DEFAULT 0,

checkin_lat NUMERIC(10,7),
checkin_lng NUMERIC(10,7),

checkout_lat NUMERIC(10,7),
checkout_lng NUMERIC(10,7),

gps_verified BOOLEAN DEFAULT FALSE,

device_id VARCHAR(255),
ip_address VARCHAR(45),

method attendance_method DEFAULT 'qr',
status attendance_status DEFAULT 'present',

is_late BOOLEAN DEFAULT FALSE,
late_minutes INTEGER DEFAULT 0,

is_offline_record BOOLEAN DEFAULT FALSE,
synced_at TIMESTAMPTZ,

is_manually_edited BOOLEAN DEFAULT FALSE,
edited_by_admin_id INTEGER REFERENCES admins(id),
edit_reason TEXT,

notes TEXT,

created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW(),

UNIQUE(employee_id,date)
);

CREATE INDEX idx_att_emp ON attendance(employee_id);
CREATE INDEX idx_att_date ON attendance(date);

-- ============================================================
-- LEAVE REQUESTS
-- ============================================================

CREATE TYPE leave_type AS ENUM ('casual','sick','paid','other');
CREATE TYPE leave_status AS ENUM ('pending','approved','rejected','cancelled');

CREATE TABLE IF NOT EXISTS leave_requests (

id BIGSERIAL PRIMARY KEY,

employee_id VARCHAR(20) REFERENCES employees(employee_id) ON DELETE CASCADE,

leave_type leave_type,
from_date DATE,
to_date DATE,

days_requested INTEGER,

reason TEXT,

status leave_status DEFAULT 'pending',

admin_comment TEXT,
reviewed_by INTEGER REFERENCES admins(id),
reviewed_at TIMESTAMPTZ,

submitted_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW(),

CHECK (to_date >= from_date)
);

-- ============================================================
-- FACE RECOGNITION
-- ============================================================

CREATE TABLE IF NOT EXISTS face_embeddings (
id BIGSERIAL PRIMARY KEY,

employee_id VARCHAR(20) UNIQUE
REFERENCES employees(employee_id) ON DELETE CASCADE,

embedding JSONB NOT NULL,

model_version VARCHAR(50) DEFAULT 'face-api-v1',

is_active BOOLEAN DEFAULT TRUE,

created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYROLL
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_records (

id BIGSERIAL PRIMARY KEY,

employee_id VARCHAR(20)
REFERENCES employees(employee_id) ON DELETE CASCADE,

month INTEGER CHECK (month BETWEEN 1 AND 12),
year INTEGER,

base_salary NUMERIC(12,2),

working_days INTEGER DEFAULT 0,
present_days INTEGER DEFAULT 0,
absent_days INTEGER DEFAULT 0,
leave_days INTEGER DEFAULT 0,

late_deduction NUMERIC(12,2) DEFAULT 0,
overtime_bonus NUMERIC(12,2) DEFAULT 0,

leave_deduction NUMERIC(12,2) DEFAULT 0,

other_deductions NUMERIC(12,2) DEFAULT 0,
other_allowances NUMERIC(12,2) DEFAULT 0,

gross_salary NUMERIC(12,2),
net_salary NUMERIC(12,2),

status VARCHAR(20) DEFAULT 'draft',

generated_by INTEGER REFERENCES admins(id),

generated_at TIMESTAMPTZ DEFAULT NOW(),

finalized_at TIMESTAMPTZ,
finalized_by INTEGER REFERENCES admins(id),

-- Payment workflow tracking
payment_submitted_by  INTEGER REFERENCES admins(id),
payment_submitted_at  TIMESTAMPTZ,
payment_initiated_by  INTEGER REFERENCES admins(id),
payment_initiated_at  TIMESTAMPTZ,
payment_notes         TEXT,

notes TEXT,

UNIQUE(employee_id,month,year)
);

-- ============================================================
-- PUBLIC HOLIDAYS
-- ============================================================

CREATE TABLE IF NOT EXISTS public_holidays (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYROLL ITEMS  (allowances / bonuses / deductions per record)
-- ============================================================

CREATE TYPE payroll_item_type AS ENUM ('allowance','bonus','deduction','tax');

CREATE TABLE IF NOT EXISTS payroll_items (
  id          BIGSERIAL PRIMARY KEY,
  payroll_id  BIGINT NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  type        payroll_item_type NOT NULL,
  label       VARCHAR(150) NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pitems_payroll ON payroll_items(payroll_id);

-- ============================================================
-- PAYMENT TRANSACTIONS  (Chapa bank transfer records)
-- ============================================================

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

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  admin_id     INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,   -- payroll_approval | payroll_approved | payroll_rejected
  title        VARCHAR(200) NOT NULL,
  message      TEXT,
  related_type VARCHAR(50),            -- 'payroll' | 'admin'
  related_id   INTEGER,
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_admin   ON notifications(admin_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread  ON notifications(admin_id, is_read);

-- ============================================================
-- EMPLOYEE NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_notifications (
  id           BIGSERIAL PRIMARY KEY,
  employee_id  VARCHAR(20) NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,   -- salary_paid | leave_approved | leave_rejected
  title        VARCHAR(200) NOT NULL,
  message      TEXT,
  payroll_id   BIGINT REFERENCES payroll_records(id),
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_notif ON employee_notifications(employee_id, is_read);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
key VARCHAR(100) PRIMARY KEY,
value TEXT,
description TEXT,
updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_settings VALUES
('company_name','QR Attendance System','System name'),
('office_lat','22.5726','Office latitude'),
('office_lng','88.3639','Office longitude'),
('gps_radius_meters','100','Allowed GPS radius'),
('face_confidence','0.85','Face confidence threshold'),
('late_threshold','09:30','Late time threshold'),
('working_hours_per_day','8','Standard working hours');

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_emp_update
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_att_update
BEFORE UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_payroll_update
BEFORE UPDATE ON payroll_records
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_leave_update
BEFORE UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CALCULATE WORKING MINUTES
-- ============================================================

CREATE OR REPLACE FUNCTION calc_working_minutes()
RETURNS TRIGGER AS $$
BEGIN

IF NEW.check_out_time IS NOT NULL
AND NEW.check_in_time IS NOT NULL THEN

NEW.working_minutes =
FLOOR(EXTRACT(EPOCH FROM
(NEW.check_out_time - NEW.check_in_time))/60);

NEW.overtime_minutes =
GREATEST(0,NEW.working_minutes - 480);

END IF;

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_minutes
BEFORE INSERT OR UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION calc_working_minutes();

-- ============================================================
-- DEMO DATA
-- ============================================================

INSERT INTO departments(name) VALUES
('Management'),
('Operations'),
('Finance'),
('HR'),
('IT')
ON CONFLICT DO NOTHING;

INSERT INTO admins(name,email,password_hash,role)
VALUES
(
'System Admin',
'admin@company.com',
'$2b$12$FuaEMgyOTROcW6O0.EJsWeHwtmgjy5HoaOQpUjYzezq0Q.YRpEi7C',
'super_admin'
),
(
'HR Officer',
'hr@company.com',
'$2b$12$FuaEMgyOTROcW6O0.EJsWeHwtmgjy5HoaOQpUjYzezq0Q.YRpEi7C',
'hr_officer'
)
ON CONFLICT DO NOTHING;

INSERT INTO employees(
employee_id,
full_name,
email,
phone,
department_id,
designation,
date_of_joining,
base_salary,
password_hash
)
VALUES
(
'MKA-001',
'Rahul Sharma',
'rahul@company.com',
'9876543210',
1,
'Manager',
'2024-01-01',
45000,
'$2b$12$FuaEMgyOTROcW6O0.EJsWeHwtmgjy5HoaOQpUjYzezq0Q.YRpEi7C'
),
(
'MKA-002',
'Priya Singh',
'priya@company.com',
'9876543211',
2,
'Field Officer',
'2024-02-01',
35000,
'$2b$12$FuaEMgyOTROcW6O0.EJsWeHwtmgjy5HoaOQpUjYzezq0Q.YRpEi7C'
)
ON CONFLICT DO NOTHING;
