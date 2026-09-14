const db = require('../config/database');
const bcrypt = require('bcrypt');
const { AppError } = require('../utils/AppError');

/* ─── GET /api/admin/dashboard ──────────────────────────── */
const getDashboard = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [total, todayRecs, pending, deptStats, trendRaw] = await Promise.all([
      db.query('SELECT COUNT(*) FROM employees WHERE is_active = TRUE'),
      db.query(
        `SELECT
           e.employee_id, e.full_name, d.name AS department,
           a.check_in_time, a.check_out_time, a.status, a.is_late, a.method, a.working_minutes
         FROM employees e
         LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.date = $1
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE e.is_active = TRUE
         ORDER BY a.check_in_time ASC NULLS LAST`, [today]
      ),
      db.query("SELECT COUNT(*) FROM leave_requests WHERE status = 'pending'"),
      db.query(
        `SELECT d.name, COUNT(e.employee_id) AS total,
           SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present
         FROM departments d
         LEFT JOIN employees e ON e.department_id = d.id AND e.is_active = TRUE
         LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.date = $1
         GROUP BY d.name ORDER BY d.name`, [today]
      ),
      db.query(
        `SELECT date, COUNT(*) FILTER (WHERE status='present') AS present,
                COUNT(*) FILTER (WHERE status='absent')  AS absent,
                COUNT(*) FILTER (WHERE status='leave')   AS on_leave
         FROM attendance
         WHERE date >= NOW() - INTERVAL '30 days'
         GROUP BY date ORDER BY date`
      ),
    ]);

    const records       = todayRecs.rows;
    const totalCount    = parseInt(total.rows[0].count);
    const present       = records.filter(r => r.check_in_time && r.status !== 'leave').length;
    const onLeave       = records.filter(r => r.status === 'leave').length;
    const absent        = totalCount - present - onLeave;
    const late          = records.filter(r => r.is_late).length;

    return res.json({
      success: true,
      data: {
        summary: { total: totalCount, present, absent, on_leave: onLeave, late, pending_leaves: parseInt(pending.rows[0].count) },
        today_records: records,
        department_stats: deptStats.rows,
        attendance_trend: trendRaw.rows,
      },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/admin/reports ─────────────────────────────── */
const getReports = async (req, res, next) => {
  try {
    const { from, to, month, year, department, employee_id } = req.query;

    // The existing reports page requests a calendar month, while the
    // attendance page requests an explicit date range. Support both forms.
    if (month || year) {
      const reportMonth = Number(month);
      const reportYear = Number(year);
      if (!Number.isInteger(reportMonth) || reportMonth < 1 || reportMonth > 12 ||
          !Number.isInteger(reportYear) || reportYear < 2000 || reportYear > 9999) {
        throw new AppError('VALIDATION_ERROR', 'A valid month and year are required.', 400);
      }

      const start = `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`;
      const end = new Date(Date.UTC(reportYear, reportMonth, 0)).toISOString().slice(0, 10);
      const effectiveEnd = end > new Date().toISOString().slice(0, 10)
        ? new Date().toISOString().slice(0, 10)
        : end;
      const params = [start, effectiveEnd];
      let filters = '';
      if (department) { params.push(department); filters += ` AND d.name = $${params.length}`; }
      if (employee_id) { params.push(employee_id); filters += ` AND e.employee_id = $${params.length}`; }

      const rows = await db.query(
        `WITH days AS (
           SELECT d::date AS date
           FROM generate_series($1::date, $2::date, '1 day'::interval) AS d
           WHERE EXTRACT(ISODOW FROM d) < 6
         )
         SELECT e.employee_id, e.full_name, d.name AS department,
                (SELECT COUNT(*) FROM days) AS working_days,
                COUNT(a.id) FILTER (WHERE a.status = 'present') AS present_days,
                COUNT(a.id) FILTER (WHERE a.status = 'leave') AS leave_days,
                COUNT(a.id) FILTER (WHERE a.is_late = TRUE) AS late_days,
                GREATEST(0, (SELECT COUNT(*) FROM days)
                  - COUNT(a.id) FILTER (WHERE a.status IN ('present', 'leave'))) AS absent_days
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.date BETWEEN $1 AND $2
         WHERE e.is_active = TRUE ${filters}
         GROUP BY e.employee_id, e.full_name, d.name
         ORDER BY e.full_name`,
        params
      );
      return res.json({ success: true, data: rows.rows });
    }

    if (!from || !to) throw new AppError('VALIDATION_ERROR', 'from and to required.', 400);

    const params = [from, to];
    let deptJoin = '';
    let filters  = '';
    if (department) { params.push(department); filters += ` AND d.name = $${params.length}`; }
    if (employee_id){ params.push(employee_id);filters += ` AND e.employee_id = $${params.length}`; }

    const rows = await db.query(
      `SELECT e.employee_id, e.full_name, d.name AS department,
              a.date, a.check_in_time, a.check_out_time,
              a.working_minutes, a.status, a.is_late, a.method
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.date BETWEEN $1 AND $2
       WHERE e.is_active = TRUE ${filters}
       ORDER BY e.employee_id, a.date`,
      params
    );

    return res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

/* ─── POST /api/admin/employee/add ──────────────────────── */
const addEmployee = async (req, res, next) => {
  try {
    const {
      employee_id, full_name, email, phone,
      department_id, designation, date_of_joining, base_salary, password,
      bank_name, bank_code, account_number, account_name,
    } = req.body;

    const required = [employee_id, full_name, email, phone, date_of_joining, password];
    if (required.some(v => !v))
      throw new AppError('VALIDATION_ERROR', 'Missing required fields.', 400);

    // Validate bank info
    if (!bank_code || !account_number || !account_name)
      throw new AppError('VALIDATION_ERROR', 'Bank code, account number, and account name are required.', 400);

    // Coerce types — department_id must be an integer or null, never an empty string
    const deptId = department_id !== undefined && department_id !== '' && department_id !== null
      ? parseInt(department_id, 10)
      : null;
    if (deptId !== null && isNaN(deptId))
      throw new AppError('VALIDATION_ERROR', 'department_id must be a number.', 400);

    const salary = base_salary !== undefined && base_salary !== '' ? parseFloat(base_salary) : 0;

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO employees (employee_id, full_name, email, phone, department_id, designation, date_of_joining, base_salary, password_hash,
                              bank_name, bank_code, account_number, account_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING employee_id, full_name, email, phone, department_id, designation, date_of_joining, base_salary, is_active,
                 bank_name, bank_code, account_number, account_name`,
      [employee_id, full_name, email, phone, deptId, designation || null, date_of_joining, salary, hash,
       bank_name || null, bank_code, account_number, account_name]
    );
    return res.status(201).json({ success: true, employee: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return next(new AppError('DUPLICATE', 'Employee ID, email, or phone already exists.', 409));
    next(err);
  }
};

/* ─── GET /api/admin/employees ───────────────────────────── */
const getEmployees = async (req, res, next) => {
  try {
    const { search, department, active = 'true', page = 1, limit = 50 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (active !== 'all') { params.push(active === 'true'); where += ` AND e.is_active = $${params.length}`; }
    if (department) { params.push(department); where += ` AND d.name = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (e.full_name ILIKE $${params.length} OR e.employee_id ILIKE $${params.length} OR e.email ILIKE $${params.length})`;
    }
    const offset = (parseInt(page)-1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const rows = await db.query(
      `SELECT e.employee_id, e.full_name, e.email, e.phone, d.name AS department,
              e.designation, e.date_of_joining, e.base_salary, e.is_active,
              e.casual_leave_balance, e.sick_leave_balance, e.paid_leave_balance,
              e.bank_name, e.bank_code, e.account_number, e.account_name
       FROM employees e LEFT JOIN departments d ON d.id = e.department_id
       ${where}
       ORDER BY e.full_name LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    return res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

/* ─── PATCH /api/admin/employee/:id ─────────────────────── */
const updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      full_name, email, phone, department_id,
      designation, date_of_joining, base_salary, password,
    } = req.body;

    if (!full_name || !email || !phone || !date_of_joining)
      throw new AppError('VALIDATION_ERROR', 'full_name, email, phone, date_of_joining are required.', 400);

    const deptId = department_id !== undefined && department_id !== '' && department_id !== null
      ? parseInt(department_id, 10) : null;
    if (deptId !== null && isNaN(deptId))
      throw new AppError('VALIDATION_ERROR', 'department_id must be a number.', 400);

    const salary = base_salary !== undefined && base_salary !== '' ? parseFloat(base_salary) : 0;

    // Build update — only rehash password if explicitly provided
    let query, params;
    if (password && password.trim()) {
      const hash = await bcrypt.hash(password.trim(), 12);
      query = `UPDATE employees
               SET full_name=$1, email=$2, phone=$3, department_id=$4, designation=$5,
                   date_of_joining=$6, base_salary=$7, password_hash=$8, updated_at=NOW()
               WHERE employee_id=$9
               RETURNING employee_id, full_name, email, phone, department_id,
                         designation, date_of_joining, base_salary, is_active`;
      params = [full_name, email, phone, deptId, designation || null, date_of_joining, salary, hash, id];
    } else {
      query = `UPDATE employees
               SET full_name=$1, email=$2, phone=$3, department_id=$4, designation=$5,
                   date_of_joining=$6, base_salary=$7, updated_at=NOW()
               WHERE employee_id=$8
               RETURNING employee_id, full_name, email, phone, department_id,
                         designation, date_of_joining, base_salary, is_active`;
      params = [full_name, email, phone, deptId, designation || null, date_of_joining, salary, id];
    }

    const result = await db.query(query, params);
    if (!result.rowCount)
      throw new AppError('NOT_FOUND', 'Employee not found.', 404);

    // Sync new base_salary into any draft payroll records for this employee.
    // processed/paid records are intentionally left untouched.
    const draftRecords = await db.query(
      `SELECT id, working_days, overtime_bonus, late_deduction, leave_deduction,
              other_deductions, other_allowances
       FROM payroll_records
       WHERE employee_id = $1 AND status = 'draft'`,
      [id]
    );

    for (const pr of draftRecords.rows) {
      const newBase    = salary;
      const extraEarn  = parseFloat(pr.other_allowances  || 0);
      const extraDeduct= parseFloat(pr.other_deductions  || 0);
      const gross      = parseFloat((newBase + parseFloat(pr.overtime_bonus || 0) + extraEarn).toFixed(2));
      const net        = parseFloat(Math.max(0,
        gross
        - parseFloat(pr.late_deduction  || 0)
        - parseFloat(pr.leave_deduction || 0)
        - extraDeduct
      ).toFixed(2));

      await db.query(
        `UPDATE payroll_records
         SET base_salary=$1, gross_salary=$2, net_salary=$3, updated_at=NOW()
         WHERE id=$4`,
        [newBase.toFixed(2), gross.toFixed(2), net.toFixed(2), pr.id]
      );
    }

    const syncedCount = draftRecords.rows.length;
    return res.json({
      success: true,
      employee: result.rows[0],
      ...(syncedCount > 0 && { message: `Salary synced to ${syncedCount} draft payroll record(s).` }),
    });
  } catch (err) {
    if (err.code === '23505')
      return next(new AppError('DUPLICATE', 'Email or phone already in use.', 409));
    next(err);
  }
};

/* ─── PATCH /api/admin/employee/:id/deactivate ───────────── */
const deactivateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE employees SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [id]);
    return res.json({ success: true, message: 'Employee deactivated.' });
  } catch (err) { next(err); }
};

/* ─── PATCH /api/admin/employee/:id/bank ─────────────────── */
const updateEmployeeBankInfo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { bank_name, bank_code, account_number, account_name } = req.body;

    if (!bank_code || !account_number || !account_name)
      throw new AppError('VALIDATION_ERROR', 'bank_code, account_number, and account_name are required.', 400);

    const result = await db.query(
      `UPDATE employees
       SET bank_name=$1, bank_code=$2, account_number=$3, account_name=$4, updated_at=NOW()
       WHERE employee_id=$5
       RETURNING employee_id, full_name, bank_name, bank_code, account_number, account_name`,
      [bank_name || null, bank_code, account_number, account_name, id]
    );
    if (!result.rowCount) throw new AppError('NOT_FOUND', 'Employee not found.', 404);

    return res.json({ success: true, message: 'Bank info updated.', data: result.rows[0] });
  } catch (err) { next(err); }
};

/* ─── GET /api/admin/leave ───────────────────────────────── */
const getAllLeaves = async (req, res, next) => {
  try {
    const { status } = req.query;
    const validStatuses = ['pending', 'approved', 'rejected', 'cancelled'];

    let query, params;
    if (!status || status === 'all' || !validStatuses.includes(status)) {
      query = `SELECT lr.*, e.full_name, d.name AS department
               FROM leave_requests lr
               JOIN employees e ON e.employee_id = lr.employee_id
               LEFT JOIN departments d ON d.id = e.department_id
               ORDER BY lr.submitted_at DESC`;
      params = [];
    } else {
      query = `SELECT lr.*, e.full_name, d.name AS department
               FROM leave_requests lr
               JOIN employees e ON e.employee_id = lr.employee_id
               LEFT JOIN departments d ON d.id = e.department_id
               WHERE lr.status = $1
               ORDER BY lr.submitted_at DESC`;
      params = [status];
    }

    const rows = await db.query(query, params);
    return res.json({ success: true, data: rows.rows, total: rows.rows.length });
  } catch (err) { next(err); }
};

module.exports = { getDashboard, getReports, addEmployee, getEmployees, updateEmployee, deactivateEmployee, getAllLeaves, updateEmployeeBankInfo };
