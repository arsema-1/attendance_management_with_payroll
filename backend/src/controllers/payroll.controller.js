const db          = require('../config/database');
const ExcelJS     = require('exceljs');
const PDFDocument = require('pdfkit');
const { AppError } = require('../utils/AppError');

/* ─── helpers ─────────────────────────────────────────────── */
function calcWorkingDays(year, month, holidaySet) {
  const days = new Date(year, month, 0).getDate();
  let count  = 0;
  for (let d = 1; d <= days; d++) {
    const dt  = new Date(year, month - 1, d);
    const iso = dt.toISOString().split('T')[0];
    if (dt.getDay() !== 0 && dt.getDay() !== 6 && !holidaySet.has(iso)) count++;
  }
  return count;
}

async function getHolidaySet(month, year) {
  const rows = await db.query(
    `SELECT date FROM public_holidays
     WHERE EXTRACT(MONTH FROM date)=$1 AND EXTRACT(YEAR FROM date)=$2`,
    [month, year]
  );
  return new Set(rows.rows.map(r => r.date.toISOString().split('T')[0]));
}

async function getAttendanceSummary(employeeId, month, year) {
  const r = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='present')  AS present_days,
       COUNT(*) FILTER (WHERE status='absent')   AS absent_days,
       COUNT(*) FILTER (WHERE status='leave')    AS leave_days,
       COUNT(*) FILTER (WHERE is_late=TRUE)      AS late_days,
       COALESCE(SUM(late_minutes),0)             AS total_late_min,
       COALESCE(SUM(overtime_minutes),0)         AS total_overtime_min
     FROM attendance
     WHERE employee_id=$1
       AND EXTRACT(MONTH FROM date)=$2
       AND EXTRACT(YEAR  FROM date)=$3`,
    [employeeId, month, year]
  );
  return r.rows[0];
}

/**
 * Returns total deductible leave days for the month.
 * paid leave = free. casual / sick / other = deducted at daily rate.
 * Only counts admin-approved leaves whose dates overlap the payroll month.
 */
async function getDeductibleLeaveDays(employeeId, month, year) {
  const r = await db.query(
    `SELECT
       COALESCE(SUM(
         -- count only days that fall inside the payroll month
         (LEAST(to_date, (DATE_TRUNC('month', $2::date) + INTERVAL '1 month - 1 day')::date)
          - GREATEST(from_date, DATE_TRUNC('month', $2::date)::date)
         )::int + 1
       ), 0) AS deductible_days
     FROM leave_requests
     WHERE employee_id = $1
       AND status      = 'approved'
       AND leave_type  != 'paid'
       AND from_date <= (DATE_TRUNC('month', $2::date) + INTERVAL '1 month - 1 day')::date
       AND to_date   >= DATE_TRUNC('month', $2::date)::date`,
    [employeeId, `${year}-${String(month).padStart(2,'0')}-01`]
  );
  return parseInt(r.rows[0].deductible_days) || 0;
}

/** Recalculate net_salary from stored fields + items */
async function recalcNet(payrollId) {
  const pr = await db.query('SELECT * FROM payroll_records WHERE id=$1', [payrollId]);
  const rec = pr.rows[0];

  const items = await db.query('SELECT * FROM payroll_items WHERE payroll_id=$1', [payrollId]);

  let extraEarnings   = 0;
  let extraDeductions = 0;
  for (const item of items.rows) {
    const amt = parseFloat(item.amount);
    if (item.type === 'allowance' || item.type === 'bonus') extraEarnings   += amt;
    else                                                      extraDeductions += amt;
  }

  const gross  = parseFloat(rec.base_salary)
               + parseFloat(rec.overtime_bonus)
               + extraEarnings;
  const net    = Math.max(0,
    gross
    - parseFloat(rec.late_deduction)
    - parseFloat(rec.leave_deduction  || 0)
    - parseFloat(rec.other_deductions || 0)
    - extraDeductions
  );

  await db.query(
    `UPDATE payroll_records
     SET gross_salary=$1, net_salary=$2, other_allowances=$3, other_deductions=$4, updated_at=NOW()
     WHERE id=$5`,
    [gross.toFixed(2), net.toFixed(2), extraEarnings.toFixed(2), extraDeductions.toFixed(2), payrollId]
  );
  return { gross, net };
}

/** Create a notification for an admin */
async function createNotification(adminId, type, title, message, relatedId, relatedType) {
  await db.query(
    `INSERT INTO notifications (admin_id, type, title, message, related_id, related_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminId, type, title, message, relatedId || null, relatedType || null]
  );
}

/** Get all super_admin and hr_admin IDs (to notify them) */
async function getAdminIdsToNotify(excludeId) {
  const r = await db.query(
    `SELECT id FROM admins WHERE role IN ('super_admin', 'hr_admin') AND is_active = TRUE AND id != $1`,
    [excludeId || 0]
  );
  return r.rows.map(row => row.id);
}

/* ─── POST /api/payroll/generate ─────────────────────────── */
const generatePayroll = async (req, res, next) => {
  try {
    const { month, year, employee_id } = req.body;
    if (!month || !year)
      throw new AppError('VALIDATION_ERROR', 'month and year required.', 400);

    const holidaySet  = await getHolidaySet(month, year);
    const workingDays = calcWorkingDays(year, month, holidaySet);
    if (workingDays === 0)
      throw new AppError('VALIDATION_ERROR', 'No working days found for this month.', 400);

    const empFilter = employee_id ? `AND e.employee_id=$1` : '';
    const params    = employee_id ? [employee_id] : [];
    const emps      = await db.query(
      `SELECT e.employee_id, e.full_name, e.base_salary, d.name AS department
       FROM employees e
       LEFT JOIN departments d ON d.id=e.department_id
       WHERE e.is_active=TRUE ${empFilter}`,
      params
    );

    const LATE_RATE_PER_HOUR = 20; // $20 deducted per hour late
    const WORK_HOURS_PER_DAY = 8;
    const results   = [];

    for (const emp of emps.rows) {
      const a           = await getAttendanceSummary(emp.employee_id, month, year);
      const presentDays = parseInt(a.present_days)       || 0;
      const absentDays  = parseInt(a.absent_days)        || 0;
      const leaveDays   = parseInt(a.leave_days)         || 0;
      const lateDays    = parseInt(a.late_days)          || 0;
      const lateMin     = parseInt(a.total_late_min)     || 0;
      const overtimeMin = parseInt(a.total_overtime_min) || 0;

      const baseSalary  = parseFloat(emp.base_salary) || 0;
      const dailyRate   = workingDays > 0 ? baseSalary / workingDays : 0;
      const hourlyRate  = dailyRate / WORK_HOURS_PER_DAY;

      // Late: $20/hr on actual late minutes
      const lateHours     = lateMin / 60;
      const lateDeduction = parseFloat((lateHours * LATE_RATE_PER_HOUR).toFixed(2));

      // Absent: full daily rate per absent day
      const absentDeduct = parseFloat((absentDays * dailyRate).toFixed(2));

      // Unpaid leave: casual/sick/other approved leaves deducted at daily rate; paid = free
      const deductibleLeaveDays = await getDeductibleLeaveDays(emp.employee_id, month, year);
      const leaveDeduction      = parseFloat((deductibleLeaveDays * dailyRate).toFixed(2));

      const overtimeBonus = parseFloat(((overtimeMin / 60) * hourlyRate * 1.5).toFixed(2));
      const grossSalary   = parseFloat((baseSalary + overtimeBonus).toFixed(2));
      const netSalary     = parseFloat(
        Math.max(0, grossSalary - lateDeduction - absentDeduct - leaveDeduction).toFixed(2)
      );

      const rec = await db.query(
        `INSERT INTO payroll_records
           (employee_id, month, year, base_salary, working_days, present_days,
            absent_days, leave_days, late_deduction, leave_deduction, overtime_bonus,
            other_deductions, other_allowances, gross_salary, net_salary,
            status, generated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,0,$12,$13,'draft',$14)
         ON CONFLICT (employee_id, month, year) DO UPDATE SET
           base_salary=$4, working_days=$5, present_days=$6, absent_days=$7,
           leave_days=$8, late_deduction=$9, leave_deduction=$10, overtime_bonus=$11,
           gross_salary=$12, net_salary=$13,
           status=CASE WHEN payroll_records.status='paid' THEN 'paid' ELSE 'draft' END,
           generated_by=$14, generated_at=NOW()
         RETURNING *`,
        [emp.employee_id, month, year, baseSalary.toFixed(2), workingDays,
         presentDays, absentDays, leaveDays,
         lateDeduction, leaveDeduction, overtimeBonus,
         grossSalary, netSalary, req.admin.id]
      );

      const saved = rec.rows[0];
      await recalcNet(saved.id);

      results.push({
        ...saved,
        employee_name:         emp.full_name,
        department:            emp.department,
        late_days:             lateDays,
        late_hours:            lateHours.toFixed(2),
        overtime_hours:        (overtimeMin / 60).toFixed(1),
        absent_deduction:      absentDeduct,
        deductible_leave_days: deductibleLeaveDays,
      });
    }

    return res.json({
      success: true,
      message: `Payroll generated for ${results.length} employee(s).`,
      data: { month, year, working_days: workingDays, records: results },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/list ──────────────────────────────── */
const getPayrollList = async (req, res, next) => {
  try {
    const { month, year, department, status, search } = req.query;
    if (!month || !year)
      throw new AppError('VALIDATION_ERROR', 'month and year required.', 400);

    const conditions = ['pr.month=$1', 'pr.year=$2'];
    const params     = [month, year];

    if (req.user) { // employee — own record only
      params.push(req.user.employee_id);
      conditions.push(`pr.employee_id=$${params.length}`);
    } else {
      if (department) { params.push(department); conditions.push(`d.name ILIKE $${params.length}`); }
      if (status)     { params.push(status);     conditions.push(`pr.status=$${params.length}`); }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(e.full_name ILIKE $${params.length} OR e.employee_id ILIKE $${params.length})`);
      }
    }

    const rows = await db.query(
      `SELECT pr.*,
              e.full_name, e.designation,
              e.bank_name, e.bank_code, e.account_number, e.account_name,
              d.name AS department,
              sub_admin.name AS submitted_by_name,
              app_admin.name AS approved_by_name
       FROM payroll_records pr
       JOIN employees e ON e.employee_id=pr.employee_id
       LEFT JOIN departments d ON d.id=e.department_id
       LEFT JOIN admins sub_admin ON sub_admin.id=pr.submitted_by
       LEFT JOIN admins app_admin ON app_admin.id=pr.approved_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.full_name`,
      params
    );

    // Attach items for each record
    const ids = rows.rows.map(r => r.id);
    let itemsMap = {};
    if (ids.length) {
      const items = await db.query(
        `SELECT * FROM payroll_items WHERE payroll_id=ANY($1)`, [ids]
      );
      for (const item of items.rows) {
        if (!itemsMap[item.payroll_id]) itemsMap[item.payroll_id] = [];
        itemsMap[item.payroll_id].push(item);
      }
    }

    const data = rows.rows.map(r => ({ ...r, items: itemsMap[r.id] || [] }));
    return res.json({ success: true, data });
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/summary ───────────────────────────── */
const getPayrollSummary = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    if (!month || !year)
      throw new AppError('VALIDATION_ERROR', 'month and year required.', 400);

    const r = await db.query(
      `SELECT
         COUNT(*)                       AS total_employees,
         COALESCE(SUM(gross_salary),0)  AS total_gross,
         COALESCE(SUM(net_salary),0)    AS total_net,
         COALESCE(SUM(late_deduction),0)+ COALESCE(SUM(other_deductions),0) AS total_deductions,
         COALESCE(SUM(overtime_bonus),0) AS total_overtime,
         COUNT(*) FILTER (WHERE status='draft')     AS draft_count,
         COUNT(*) FILTER (WHERE status='finalized')       AS finalized_count,
         COUNT(*) FILTER (WHERE status='pending_payment') AS pending_payment_count,
         COUNT(*) FILTER (WHERE status='paid')            AS paid_count,
         COUNT(*) FILTER (WHERE status='failed')          AS failed_count,
         COUNT(*) FILTER (WHERE approval_status='pending_approval') AS pending_approval_count,
         COUNT(*) FILTER (WHERE approval_status='approved')         AS approved_count,
         COUNT(*) FILTER (WHERE approval_status='rejected')         AS rejected_count
       FROM payroll_records
       WHERE month=$1 AND year=$2`,
      [month, year]
    );

    return res.json({ success: true, data: r.rows[0] });
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/slip/:id ──────────────────────────── */
const getPayslip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pr = await db.query(
      `SELECT pr.*, e.full_name, e.employee_id, e.designation, e.date_of_joining,
              e.email, e.phone, d.name AS department,
              pt.tx_ref AS transaction_reference, pt.status AS payment_status,
              pt.created_at AS transaction_created_at, pt.initiated_at AS transaction_initiated_at
       FROM payroll_records pr
       JOIN employees e ON e.employee_id=pr.employee_id
       LEFT JOIN departments d ON d.id=e.department_id
       LEFT JOIN LATERAL (
         SELECT tx_ref, status, created_at, initiated_at
         FROM payment_transactions
         WHERE payroll_id=pr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) pt ON TRUE
       WHERE pr.id=$1`,
      [id]
    );
    if (!pr.rows.length) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);

    // Employee can only see own payslip
    if (req.user && pr.rows[0].employee_id !== req.user.employee_id)
      throw new AppError('FORBIDDEN', 'Access denied.', 403);

    const items = await db.query(
      'SELECT * FROM payroll_items WHERE payroll_id=$1 ORDER BY type, label',
      [id]
    );

    // Attendance summary
    const att = await getAttendanceSummary(
      pr.rows[0].employee_id, pr.rows[0].month, pr.rows[0].year
    );

    return res.json({
      success: true,
      data: { ...pr.rows[0], items: items.rows, attendance: att },
    });
  } catch (err) { next(err); }
};

/* ─── POST /api/payroll/:id/items ────────────────────────── */
const addPayrollItem = async (req, res, next) => {
  try {
    const { id }              = req.params;
    const { type, label, amount } = req.body;
    if (!type || !label || amount == null)
      throw new AppError('VALIDATION_ERROR', 'type, label, and amount are required.', 400);
    if (!['allowance','bonus','deduction','tax'].includes(type))
      throw new AppError('VALIDATION_ERROR', 'Invalid item type.', 400);

    const pr = await db.query(
      'SELECT id, status, approval_status FROM payroll_records WHERE id=$1', [id]
    );
    if (!pr.rows.length) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);
    if (pr.rows[0].status === 'paid')
      throw new AppError('CONFLICT', 'Cannot edit a paid payroll record.', 409);
    if (pr.rows[0].approval_status === 'pending_approval')
      throw new AppError('CONFLICT', 'Cannot edit while awaiting approval.', 409);

    await db.query(
      'INSERT INTO payroll_items (payroll_id, type, label, amount) VALUES ($1,$2,$3,$4)',
      [id, type, label, parseFloat(amount).toFixed(2)]
    );
    await recalcNet(id);

    const updated = await db.query(
      `SELECT pr.*, e.full_name FROM payroll_records pr
       JOIN employees e ON e.employee_id=pr.employee_id WHERE pr.id=$1`, [id]
    );
    const items = await db.query('SELECT * FROM payroll_items WHERE payroll_id=$1 ORDER BY type', [id]);

    return res.status(201).json({
      success: true,
      message: 'Item added.',
      data: { ...updated.rows[0], items: items.rows },
    });
  } catch (err) { next(err); }
};

/* ─── DELETE /api/payroll/:id/items/:itemId ──────────────── */
const deletePayrollItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const pr = await db.query('SELECT status, approval_status FROM payroll_records WHERE id=$1', [id]);
    if (!pr.rows.length) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);
    if (pr.rows[0].status === 'paid')
      throw new AppError('CONFLICT', 'Cannot edit a paid payroll record.', 409);
    if (pr.rows[0].approval_status === 'pending_approval')
      throw new AppError('CONFLICT', 'Cannot edit while awaiting approval.', 409);

    await db.query('DELETE FROM payroll_items WHERE id=$1 AND payroll_id=$2', [itemId, id]);
    await recalcNet(id);

    return res.json({ success: true, message: 'Item removed.' });
  } catch (err) { next(err); }
};

/* ─── PATCH /api/payroll/:id/status ──────────────────────── */
const updateStatus = async (req, res, next) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;
    const role       = req.admin?.role;

    // HR Officer: draft <-> finalized only
    // Admin roles: full workflow
    const ALL_STATUSES = ['draft','finalized','pending_payment','paid','failed'];
    if (!ALL_STATUSES.includes(status))
      throw new AppError('VALIDATION_ERROR', `Invalid status: ${status}.`, 400);

    if (role === 'hr_officer' && !['draft','finalized'].includes(status))
      throw new AppError('FORBIDDEN', 'HR Officer can only set status to draft or finalized.', 403);

    const pr = await db.query('SELECT status, approval_status FROM payroll_records WHERE id=$1', [id]);
    if (!pr.rows.length) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);

    const current = pr.rows[0].status;
    const approval = pr.rows[0].approval_status;

    // Block status changes if pending approval
    if (approval === 'pending_approval' && !['draft'].includes(status))
      throw new AppError('CONFLICT', 'Cannot change status while payroll is pending approval. Wait for admin decision.', 409);

    const TRANSITIONS = {
      draft:                 ['finalized'],
      finalized:             ['draft','pending_admin_approval'],
      pending_admin_approval: ['paid','failed'],
      failed:                ['pending_admin_approval'],
      paid:                  [],
    };
    if (!(TRANSITIONS[current] || []).includes(status))
      throw new AppError('CONFLICT', `Cannot transition '${current}' to '${status}'.`, 409);

    const extra  = status === 'finalized' ? ', finalized_at=NOW(), finalized_by=$3' : '';
    const params = status === 'finalized' ? [status, id, req.admin.id] : [status, id];
    const rows   = await db.query(
      `UPDATE payroll_records SET status=$1${extra}, approval_status=NULL WHERE id=$2 RETURNING *`, params
    );
    return res.json({ success: true, message: `Status updated to ${status}.`, data: rows.rows[0] });
  } catch (err) { next(err); }
};

/* ─── PATCH /api/payroll/bulk-status ─────────────────────── */
const bulkUpdateStatus = async (req, res, next) => {
  try {
    const { month, year, status } = req.body;
    const role = req.admin?.role;
    if (!month || !year || !status)
      throw new AppError('VALIDATION_ERROR', 'month, year, and status required.', 400);

    // HR: bulk draft->finalized only; Admin: finalized->pending_payment
    const TRANSITIONS = { finalized: 'draft', pending_payment: 'finalized', paid: 'pending_payment' };
    if (role === 'hr_officer' && status !== 'finalized')
      throw new AppError('FORBIDDEN', 'HR Officer can only bulk-finalize draft records.', 403);

    const fromStatus = TRANSITIONS[status];
    if (!fromStatus)
      throw new AppError('VALIDATION_ERROR', 'Can only bulk-set: finalized, pending_payment, or paid.', 400);

    const extra = status === 'finalized' ? `, finalized_at=NOW(), finalized_by=${4}` : '';
    const params = status === 'finalized'
      ? [status, month, year, fromStatus, req.admin.id]
      : [status, month, year, fromStatus];
    const rows = await db.query(
      `UPDATE payroll_records SET status=$1${status === 'finalized' ? ', finalized_at=NOW(), finalized_by=$5' : ''}, approval_status=NULL
       WHERE month=$2 AND year=$3 AND status=$4 RETURNING id`,
      params
    );
    return res.json({ success: true, message: `${rows.rowCount} record(s) updated to ${status}.` });
  } catch (err) { next(err); }
};

/* ─── POST /api/payroll/submit-for-approval ──────────────── */
const submitForApproval = async (req, res, next) => {
  try {
    const { month, year } = req.body;
    if (!month || !year)
      throw new AppError('VALIDATION_ERROR', 'month and year required.', 400);

    // Only HR officers can submit for approval
    if (req.admin?.role !== 'hr_officer' && req.admin?.role !== 'hr_admin')
      throw new AppError('FORBIDDEN', 'Only HR can submit payroll for approval.', 403);

    // Find all finalized records for this month/year that haven't been submitted yet
    const records = await db.query(
      `SELECT pr.id, pr.employee_id, e.full_name, pr.net_salary
       FROM payroll_records pr
       JOIN employees e ON e.employee_id=pr.employee_id
       WHERE pr.month=$1 AND pr.year=$2 AND pr.status='finalized'
         AND (pr.approval_status IS NULL OR pr.approval_status NOT IN ('pending_approval'))`,
      [month, year]
    );

    if (!records.rows.length)
      throw new AppError('VALIDATION_ERROR', 'No finalized payroll records found to submit for approval.', 400);

    const bulkRequestId = `BULK-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Update all finalized records to pending_approval
    await db.query(
      `UPDATE payroll_records
       SET approval_status='pending_approval',
           submitted_by=$3,
           submitted_at=NOW(),
           bulk_request_id=$4
       WHERE month=$1 AND year=$2 AND status='finalized'
         AND (approval_status IS NULL OR approval_status NOT IN ('pending_approval'))`,
      [month, year, req.admin.id, bulkRequestId]
    );

    // Notify all admins (super_admin and hr_admin)
    const adminIds = await getAdminIdsToNotify(req.admin.id);
    const totalNet = records.rows.reduce((sum, r) => sum + parseFloat(r.net_salary || 0), 0);
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

    for (const adminId of adminIds) {
      await createNotification(
        adminId,
        'payroll_approval',
        'Payroll Approval Request',
        `HR has submitted payroll for ${monthName} ${year} — ${records.rows.length} record(s), total net: ${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB. Please review and approve.`,
        null,
        'payroll_bulk'
      );
    }

    return res.json({
      success: true,
      message: `${records.rows.length} record(s) submitted for approval.`,
      data: { bulk_request_id: bulkRequestId, count: records.rows.length },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/pending-approvals ─────────────────── */
const getPendingApprovals = async (req, res, next) => {
  try {
    // Only admin roles can view pending approvals
    if (['hr_officer', 'viewer'].includes(req.admin?.role))
      throw new AppError('FORBIDDEN', 'Insufficient permissions.', 403);

    const { month, year } = req.query;

    let query = `
      SELECT pr.*,
             e.full_name, e.designation, e.employee_id,
             e.bank_name, e.bank_code, e.account_number, e.account_name,
             d.name AS department,
             sub_admin.name AS submitted_by_name,
             sub_admin.email AS submitted_by_email
      FROM payroll_records pr
      JOIN employees e ON e.employee_id=pr.employee_id
      LEFT JOIN departments d ON d.id=e.department_id
      LEFT JOIN admins sub_admin ON sub_admin.id=pr.submitted_by
      WHERE pr.approval_status = 'pending_approval'`;

    const params = [];

    if (month && year) {
      params.push(month, year);
      query += ` AND pr.month=$${params.length - 1} AND pr.year=$${params.length}`;
    }

    query += ` ORDER BY pr.submitted_at DESC, e.full_name`;

    const rows = await db.query(query, params);

    // Attach items
    const ids = rows.rows.map(r => r.id);
    let itemsMap = {};
    if (ids.length) {
      const items = await db.query(
        `SELECT * FROM payroll_items WHERE payroll_id=ANY($1)`, [ids]
      );
      for (const item of items.rows) {
        if (!itemsMap[item.payroll_id]) itemsMap[item.payroll_id] = [];
        itemsMap[item.payroll_id].push(item);
      }
    }

    // Group by bulk_request_id for summary
    const grouped = {};
    for (const rec of rows.rows) {
      const key = rec.bulk_request_id || `single-${rec.id}`;
      if (!grouped[key]) {
        grouped[key] = {
          bulk_request_id: rec.bulk_request_id,
          month: rec.month,
          year: rec.year,
          submitted_by: rec.submitted_by_name,
          submitted_by_email: rec.submitted_by_email,
          submitted_at: rec.submitted_at,
          records: [],
          total_net: 0,
          count: 0,
        };
      }
      grouped[key].records.push({ ...rec, items: itemsMap[rec.id] || [] });
      grouped[key].total_net += parseFloat(rec.net_salary || 0);
      grouped[key].count++;
    }

    return res.json({ success: true, data: Object.values(grouped) });
  } catch (err) { next(err); }
};

/* ─── POST /api/payroll/:id/approve ──────────────────────── */
const approvePayroll = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};

    // Only admin roles can approve
    if (['hr_officer', 'viewer'].includes(req.admin?.role))
      throw new AppError('FORBIDDEN', 'Only administrators can approve payroll.', 403);

    const pr = await db.query(
      'SELECT id, approval_status, month, year, employee_id FROM payroll_records WHERE id=$1', [id]
    );
    if (!pr.rows.length) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);
    if (pr.rows[0].approval_status !== 'pending_approval')
      throw new AppError('CONFLICT', 'This payroll record is not pending approval.', 409);

    const result = await db.query(
      `UPDATE payroll_records
       SET approval_status='approved', approved_by=$2, approved_at=NOW(), approval_notes=$3
       WHERE id=$1 RETURNING *`,
      [id, req.admin.id, notes || null]
    );

    // Auto-transition to pending_admin_approval so payment flow can start
    await db.query(
      `UPDATE payroll_records
       SET status='pending_admin_approval', updated_at=NOW()
       WHERE id=$1 AND status='finalized'`,
      [id]
    );

    // Notify the HR officer who submitted
    const hrAdminId = pr.rows[0].submitted_by || req.admin.id;
    if (hrAdminId !== req.admin.id) {
      await createNotification(
        hrAdminId,
        'payroll_approved',
        'Payroll Approved',
        `Your payroll submission for ${pr.rows[0].employee_id} has been approved by ${req.admin.name || 'Admin'}. Ready for payment initiation.`,
        id,
        'payroll'
      );
    }

    return res.json({
      success: true,
      message: 'Payroll record approved and ready for payment.',
      data: result.rows[0],
    });
  } catch (err) { next(err); }
};

/* ─── POST /api/payroll/:id/reject ───────────────────────── */
const rejectPayroll = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    // Only admin roles can reject
    if (['hr_officer', 'viewer'].includes(req.admin?.role))
      throw new AppError('FORBIDDEN', 'Only administrators can reject payroll.', 403);

    const pr = await db.query(
      'SELECT id, approval_status, month, year, employee_id, submitted_by FROM payroll_records WHERE id=$1', [id]
    );
    if (!pr.rows.length) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);
    if (pr.rows[0].approval_status !== 'pending_approval')
      throw new AppError('CONFLICT', 'This payroll record is not pending approval.', 409);

    // Revert to draft so HR can fix and resubmit
    const result = await db.query(
      `UPDATE payroll_records
       SET approval_status='rejected', approval_notes=$2, approved_by=$3, approved_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, reason || 'Rejected by admin', req.admin.id]
    );

    // Notify the HR officer who submitted
    const hrAdminId = pr.rows[0].submitted_by || req.admin.id;
    if (hrAdminId !== req.admin.id) {
      await createNotification(
        hrAdminId,
        'payroll_rejected',
        'Payroll Rejected',
        `Your payroll submission for ${pr.rows[0].employee_id} has been rejected. Reason: ${reason || 'No reason provided'}. Please review and resubmit.`,
        id,
        'payroll'
      );
    }

    return res.json({
      success: true,
      message: 'Payroll record rejected.',
      data: result.rows[0],
    });
  } catch (err) { next(err); }
};

/* ─── POST /api/payroll/bulk-approve ─────────────────────── */
const bulkApprove = async (req, res, next) => {
  try {
    const { bulk_request_id, month, year } = req.body;

    if (['hr_officer', 'viewer'].includes(req.admin?.role))
      throw new AppError('FORBIDDEN', 'Only administrators can approve payroll.', 403);

    let condition = '';
    const params = [];

    if (bulk_request_id) {
      params.push(bulk_request_id);
      condition = `bulk_request_id=$${params.length}`;
    } else if (month && year) {
      params.push(month, year);
      condition = `month=$${params.length - 1} AND year=$${params.length}`;
    } else {
      throw new AppError('VALIDATION_ERROR', 'bulk_request_id or month+year required.', 400);
    }

    const result = await db.query(
      `UPDATE payroll_records
       SET approval_status='approved', approved_by=$${params.length + 1}, approved_at=NOW()
       WHERE ${condition} AND approval_status='pending_approval'
       RETURNING id, employee_id`,
      [...params, req.admin.id]
    );

    // Auto-transition approved records to pending_admin_approval for payment
    const approvedIds = result.rows.map(r => r.id);
    if (approvedIds.length > 0) {
      await db.query(
        `UPDATE payroll_records
         SET status='pending_admin_approval', updated_at=NOW()
         WHERE id = ANY($1) AND status='finalized'`,
        [approvedIds]
      );
    }

    // Notify HR for each record
    if (result.rows.length > 0) {
      const hrIds = [...new Set(result.rows.map(() => req.admin.id))]; // In real app, get from submitted_by
      for (const hrId of hrIds) {
        await createNotification(
          hrId,
          'payroll_approved',
          'Payroll Bulk Approved',
          `${result.rows.length} payroll record(s) have been approved by ${req.admin.name || 'Admin'}. Ready for payment initiation.`,
          null,
          'payroll_bulk'
        );
      }
    }

    return res.json({
      success: true,
      message: `${result.rowCount} record(s) approved and ready for payment.`,
      data: { approved_count: result.rowCount },
    });
  } catch (err) { next(err); }
};

/* ─── POST /api/payroll/bulk-reject ──────────────────────── */
const bulkReject = async (req, res, next) => {
  try {
    const { bulk_request_id, month, year, reason } = req.body;

    if (['hr_officer', 'viewer'].includes(req.admin?.role))
      throw new AppError('FORBIDDEN', 'Only administrators can reject payroll.', 403);

    let condition = '';
    const params = [];

    if (bulk_request_id) {
      params.push(bulk_request_id);
      condition = `bulk_request_id=$${params.length}`;
    } else if (month && year) {
      params.push(month, year);
      condition = `month=$${params.length - 1} AND year=$${params.length}`;
    } else {
      throw new AppError('VALIDATION_ERROR', 'bulk_request_id or month+year required.', 400);
    }

    const result = await db.query(
      `UPDATE payroll_records
       SET approval_status='rejected', approval_notes=$${params.length + 1},
           approved_by=$${params.length + 2}, approved_at=NOW()
       WHERE ${condition} AND approval_status='pending_approval'
       RETURNING id, employee_id`,
      [...params, reason || 'Bulk rejected by admin', req.admin.id]
    );

    return res.json({
      success: true,
      message: `${result.rowCount} record(s) rejected.`,
      data: { rejected_count: result.rowCount },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/history ───────────────────────────── */
const getHistory = async (req, res, next) => {
  try {
    const { employee_id, year, page = 1, limit = 24 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['1=1'];
    const params     = [];

    if (req.user) {
      params.push(req.user.employee_id);
      conditions.push(`pr.employee_id=$${params.length}`);
    } else if (employee_id) {
      params.push(employee_id);
      conditions.push(`pr.employee_id=$${params.length}`);
    }

    if (year) { params.push(year); conditions.push(`pr.year=$${params.length}`); }

    params.push(parseInt(limit)); const limitIdx  = params.length;
    params.push(offset);          const offsetIdx = params.length;

    const rows = await db.query(
      `SELECT pr.id, pr.month, pr.year, pr.net_salary, pr.gross_salary,
              pr.status, pr.approval_status, pr.generated_at,
              e.full_name, e.employee_id, d.name AS department
       FROM payroll_records pr
       JOIN employees e ON e.employee_id=pr.employee_id
       LEFT JOIN departments d ON d.id=e.department_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pr.year DESC, pr.month DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/export ────────────────────────────── */
const exportPayroll = async (req, res, next) => {
  try {
    const { month, year, format: fmt = 'excel' } = req.query;
    if (!month || !year)
      throw new AppError('VALIDATION_ERROR', 'month and year required.', 400);

    const rows = await db.query(
      `SELECT pr.*, e.full_name, e.designation, d.name AS department
       FROM payroll_records pr
       JOIN employees e ON e.employee_id=pr.employee_id
       LEFT JOIN departments d ON d.id=e.department_id
       WHERE pr.month=$1 AND pr.year=$2
       ORDER BY e.full_name`,
      [month, year]
    );

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const filename  = `payroll-${monthName}-${year}`;

    if (fmt === 'pdf') {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      doc.pipe(res);

      doc.fillColor('#0891B2').fontSize(18).text('Payroll Report', { align: 'center' });
      doc.fillColor('#333').fontSize(12)
         .text(`${monthName} ${year}`, { align: 'center' });
      doc.moveDown(0.5);

      const totalNet = rows.rows.reduce((s, r) => s + parseFloat(r.net_salary), 0);
      doc.fontSize(10).text(
        `Employees: ${rows.rows.length}   |   Total Net Payroll: ${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        { align: 'center' }
      );
      doc.moveDown();

      const cols   = ['ID', 'Name', 'Dept', 'Designation', 'Basic', 'Present', 'Absent', 'Late Ded', 'OT Bonus', 'Gross', 'Net', 'Status'];
      const widths = [55, 100, 70, 80, 60, 45, 45, 55, 55, 60, 60, 55];
      let x = 40, y = doc.y;
      doc.fillColor('#0891B2').rect(x, y, widths.reduce((a, b) => a + b, 0), 20).fill();
      doc.fillColor('#fff').fontSize(8);
      cols.forEach((c, i) => { doc.text(c, x + 2, y + 6, { width: widths[i] - 4 }); x += widths[i]; });
      y += 20;

      rows.rows.forEach((r, idx) => {
        x = 40;
        if (idx % 2 === 0) doc.fillColor('#f0f9ff').rect(40, y, widths.reduce((a,b)=>a+b,0), 18).fill();
        doc.fillColor('#333').fontSize(7.5);
        const vals = [
          r.employee_id, r.full_name, r.department || '', r.designation || '',
          `${parseFloat(r.base_salary).toFixed(0)}`,
          r.present_days, r.absent_days,
          `${parseFloat(r.late_deduction).toFixed(0)}`,
          `${parseFloat(r.overtime_bonus).toFixed(0)}`,
          `${parseFloat(r.gross_salary).toFixed(0)}`,
          `${parseFloat(r.net_salary).toFixed(0)}`,
          r.status,
        ];
        vals.forEach((v, i) => { doc.text(String(v), x + 2, y + 4, { width: widths[i] - 4 }); x += widths[i]; });
        y += 18;
        if (y > 530) { doc.addPage({ layout: 'landscape' }); y = 40; }
      });

      doc.end();
      return;
    }

    // Excel (default)
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${monthName} ${year}`);
    const headers = [
      'Employee ID','Name','Department','Designation',
      'Basic Salary','Working Days','Present','Absent','Leave',
      'Late Days','Late Deduction','OT Hours','OT Bonus',
      'Allowances','Deductions','Gross Salary','Net Salary','Status',
    ];
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
    ws.columns = headers.map(h => ({ header: h, key: h, width: 16 }));

    rows.rows.forEach(r => {
      ws.addRow([
        r.employee_id, r.full_name, r.department || '', r.designation || '',
        parseFloat(r.base_salary), r.working_days, r.present_days, r.absent_days, r.leave_days,
        0, parseFloat(r.late_deduction),
        (parseFloat(r.overtime_bonus) / (parseFloat(r.base_salary) / (r.working_days||1) / 8 * 1.5) || 0).toFixed(1),
        parseFloat(r.overtime_bonus),
        parseFloat(r.other_allowances), parseFloat(r.other_deductions),
        parseFloat(r.gross_salary), parseFloat(r.net_salary), r.status,
      ]);
    });

    ['Basic Salary','Late Deduction','OT Bonus','Allowances','Deductions','Gross Salary','Net Salary'].forEach(col => {
      ws.getColumn(col).numFmt = '$#,##0.00';
    });

    const lastRow = ws.lastRow.number + 1;
    const netCol  = headers.indexOf('Net Salary') + 1;
    ws.addRow([
      'TOTAL', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '',
      { formula: `SUM(${ws.getColumn(netCol).letter}2:${ws.getColumn(netCol).letter}${lastRow - 1})` },
      '',
    ]);
    ws.getRow(lastRow).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/slip/:id/pdf ──────────────────────── */
const downloadPayslipPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pr = await db.query(
      `SELECT pr.*, e.full_name, e.employee_id, e.designation,
              e.date_of_joining, e.email, e.phone, d.name AS department
       FROM payroll_records pr
       JOIN employees e ON e.employee_id=pr.employee_id
       LEFT JOIN departments d ON d.id=e.department_id
       WHERE pr.id=$1`, [id]
    );
    if (!pr.rows.length) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);
    if (req.user && pr.rows[0].employee_id !== req.user.employee_id)
      throw new AppError('FORBIDDEN', 'Access denied.', 403);

    const rec   = pr.rows[0];
    const items = await db.query(
      'SELECT * FROM payroll_items WHERE payroll_id=$1 ORDER BY type, label', [id]
    );
    const monthName = new Date(rec.year, rec.month - 1).toLocaleString('default', { month: 'long' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="payslip-${rec.employee_id}-${monthName}-${rec.year}.pdf"`
    );
    doc.pipe(res);

    // Header band
    doc.rect(0, 0, 595, 80).fill('#0891B2');
    doc.fillColor('#fff').fontSize(20).text('PAYSLIP', 50, 22, { align: 'left' });
    doc.fontSize(11).text(`${monthName} ${rec.year}`, 50, 46);
    doc.fontSize(10).text('Manikstu Agro', 0, 28, { align: 'right', width: 545 });
    doc.fontSize(9).text('HR & Payroll System', 0, 44, { align: 'right', width: 545 });
    doc.fillColor('#333');

    // Employee info
    const infoY = 100;
    doc.fontSize(10);
    const infoLeft  = [
      ['Employee Name', rec.full_name],
      ['Employee ID',   rec.employee_id],
      ['Department',    rec.department || '—'],
      ['Designation',   rec.designation || '—'],
    ];
    const infoRight = [
      ['Date of Joining', rec.date_of_joining ? new Date(rec.date_of_joining).toLocaleDateString('en-US') : '—'],
      ['Email',           rec.email || '—'],
      ['Phone',           rec.phone || '—'],
      ['Pay Period',      `${monthName} ${rec.year}`],
    ];
    infoLeft.forEach(([k, v], i) => {
      doc.fillColor('#6b7280').text(k, 50, infoY + i * 20, { continued: false });
      doc.fillColor('#111').text(v, 200, infoY + i * 20);
    });
    infoRight.forEach(([k, v], i) => {
      doc.fillColor('#6b7280').text(k, 320, infoY + i * 20, { continued: false });
      doc.fillColor('#111').text(v, 450, infoY + i * 20);
    });

    // Attendance strip
    const attY = infoY + 100;
    doc.rect(50, attY, 495, 36).fill('#f0f9ff');
    doc.fillColor('#0891B2').fontSize(9);
    const attItems = [
      ['Working Days', rec.working_days],
      ['Present',      rec.present_days],
      ['Absent',       rec.absent_days],
      ['Leave',        rec.leave_days],
      ['OT Hours',     (parseFloat(rec.overtime_bonus) > 0 ? '—' : '0')],
    ];
    attItems.forEach(([k, v], i) => {
      const ax = 60 + i * 99;
      doc.fillColor('#374151').text(k, ax, attY + 5, { width: 90, align: 'center' });
      doc.fillColor('#0891B2').fontSize(12).text(String(v), ax, attY + 18, { width: 90, align: 'center' });
      doc.fontSize(9);
    });

    // Earnings & Deductions table
    const tableY = attY + 55;
    doc.fillColor('#0891B2').rect(50, tableY, 240, 20).fill();
    doc.fillColor('#0891B2').rect(305, tableY, 240, 20).fill();
    doc.fillColor('#fff').fontSize(9)
       .text('EARNINGS', 50, tableY + 6, { width: 240, align: 'center' })
       .text('DEDUCTIONS', 305, tableY + 6, { width: 240, align: 'center' });

    const fmtPdf = (n) => `${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const earnings = [
      ['Basic Salary',   fmtPdf(rec.base_salary)],
      ['Overtime Bonus', fmtPdf(rec.overtime_bonus)],
      ...items.rows
        .filter(i => i.type === 'allowance' || i.type === 'bonus')
        .map(i => [i.label, fmtPdf(i.amount)]),
    ];
    const deductions = [
      ['Late Deduction',  fmtPdf(rec.late_deduction)],
      ['Absent Deduction',fmtPdf((parseFloat(rec.base_salary) / (rec.working_days || 1)) * rec.absent_days)],
      ...items.rows
        .filter(i => i.type === 'deduction' || i.type === 'tax')
        .map(i => [i.label, fmtPdf(i.amount)]),
    ];

    const rowH = 20;
    const maxRows = Math.max(earnings.length, deductions.length);
    for (let i = 0; i < maxRows; i++) {
      const ry = tableY + 20 + i * rowH;
      if (i % 2 === 0) {
        doc.fillColor('#f8fafc').rect(50, ry, 240, rowH).fill();
        doc.fillColor('#f8fafc').rect(305, ry, 240, rowH).fill();
      }
      doc.fillColor('#374151').fontSize(9);
      if (earnings[i]) {
        doc.text(earnings[i][0], 58, ry + 6);
        doc.text(earnings[i][1], 200, ry + 6, { width: 85, align: 'right' });
      }
      if (deductions[i]) {
        doc.text(deductions[i][0], 313, ry + 6);
        doc.text(deductions[i][1], 455, ry + 6, { width: 85, align: 'right' });
      }
    }

    // Totals
    const totY = tableY + 20 + maxRows * rowH + 5;
    doc.fillColor('#e0f2fe').rect(50, totY, 240, 24).fill();
    doc.fillColor('#e0f2fe').rect(305, totY, 240, 24).fill();
    doc.fillColor('#0891B2').fontSize(10)
       .text('Gross Salary', 58, totY + 7)
       .text(fmtPdf(rec.gross_salary), 200, totY + 7, { width: 85, align: 'right' })
       .text('Total Deductions', 313, totY + 7)
       .text(fmtPdf(parseFloat(rec.late_deduction) + parseFloat(rec.other_deductions)), 455, totY + 7, { width: 85, align: 'right' });

    // Net salary box
    const netY = totY + 40;
    doc.fillColor('#0891B2').rect(50, netY, 495, 40).fill();
    doc.fillColor('#fff').fontSize(13)
       .text('NET SALARY', 58, netY + 13)
       .text(fmtPdf(rec.net_salary), 0, netY + 13, { width: 540, align: 'right' });

    // Status
    doc.fillColor('#6b7280').fontSize(9)
       .text(`Status: ${rec.status.toUpperCase()}   |   Generated: ${new Date(rec.generated_at).toLocaleDateString('en-US')}`,
         50, netY + 58, { align: 'center', width: 495 });

    doc.end();
  } catch (err) { next(err); }
};

/* ─── GET /api/payroll/report (legacy — kept for employee app) */
const getPayrollReport = async (req, res, next) => {
  req.query.month = req.query.month;
  req.query.year  = req.query.year;
  return getPayrollList(req, res, next);
};

module.exports = {
  generatePayroll,
  getPayrollList,
  getPayrollReport,
  getPayrollSummary,
  getPayslip,
  addPayrollItem,
  deletePayrollItem,
  updateStatus,
  bulkUpdateStatus,
  getHistory,
  exportPayroll,
  downloadPayslipPdf,
  submitForApproval,
  getPendingApprovals,
  approvePayroll,
  rejectPayroll,
  bulkApprove,
  bulkReject,
};
