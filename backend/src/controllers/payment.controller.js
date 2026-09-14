/**
 * Payment controller — Chapa bank transfer integration
 *
 * Workflow:
 *  HR Officer  → submitForPayment   (finalized → pending_payment)
 *  Admin       → initiatePayment    (calls Chapa, creates tx record)
 *  Admin       → verifyPayment      (verifies tx, marks paid/failed)
 *  Admin       → retryPayment       (re-initiates a failed tx)
 *  Admin/HR    → getPaymentStatus   (returns tx details for a payroll)
 *  Admin/HR    → getTransactions    (paginated transaction list)
 *  Admin       → getBanks           (proxy Chapa bank list)
 */
const { v4: uuidv4 }      = require('uuid');
const db                  = require('../config/database');
const { AppError }        = require('../utils/AppError');
const { logger }          = require('../utils/logger');
const chapa               = require('../services/chapa.service');
const { createNotification } = require('./notification.controller');

/* ── helpers ──────────────────────────────────────────────── */

/**
 * Safely extract a human-readable error reason from a Chapa error.
 * Chapa sometimes returns `message` as an object or nested structure,
 * which produces "[object Object]" when naively interpolated.
 */
function extractChapaErrorReason(chapaErr) {
  const data = chapaErr.response?.data;

  // Try .message first — if it's a string, use it directly
  if (data?.message && typeof data.message === 'string') return data.message;

  // If .message is an object, stringify it
  if (data?.message && typeof data.message === 'object') return JSON.stringify(data.message);

  // Try other common Chapa error fields
  if (data?.error && typeof data.error === 'string') return data.error;
  if (data?.error && typeof data.error === 'object') return JSON.stringify(data.error);

  // Fall back to the full response data stringified, or the JS error message
  if (data && typeof data === 'object') return JSON.stringify(data);

  // Last resort: the axios/JS error message
  return chapaErr.message || 'Unknown error';
}

function makeTxRef(payrollId, employeeId) {
  // short, URL-safe, unique reference
  const rand = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `PAY-${employeeId}-${payrollId}-${rand}`;
}

async function getPayrollWithEmployee(payrollId) {
  const r = await db.query(
    `SELECT pr.*,
            e.full_name, e.bank_name, e.bank_code,
            e.account_number, e.account_name
     FROM payroll_records pr
     JOIN employees e ON e.employee_id = pr.employee_id
     WHERE pr.id = $1`,
    [payrollId]
  );
  return r.rows[0] || null;
}

/* ─────────────────────────────────────────────────────────── *
 * PATCH /api/payments/:payrollId/submit
 * HR Officer submits a finalized payroll for payment approval.
 * transition: finalized → pending_admin_approval
 * ─────────────────────────────────────────────────────────── */
const submitForPayment = async (req, res, next) => {
  try {
    const { payrollId } = req.params;
    const rec = await getPayrollWithEmployee(payrollId);
    if (!rec) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);

    if (rec.status !== 'finalized')
      throw new AppError('CONFLICT', `Cannot submit: status is '${rec.status}'. Must be 'finalized'.`, 409);

    // Validate bank info present
    if (!rec.account_number || !rec.bank_code || !rec.account_name)
      throw new AppError(
        'VALIDATION_ERROR',
        'Employee is missing bank account information. Update the employee profile first.',
        400
      );

    await db.query(
      `UPDATE payroll_records
       SET status = 'pending_admin_approval',
           payment_submitted_by = $1,
           payment_submitted_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [req.admin.id, payrollId]
    );

    // Notify all super_admin and hr_admin users
    try {
      const admins = await db.query(
        "SELECT id FROM admins WHERE role IN ('super_admin','hr_admin') AND is_active=TRUE"
      );
      if (admins.rows.length) {
        await createNotification({
          adminId:     admins.rows.map(a => a.id),
          type:        'payroll_approval',
          title:       'Payroll Submitted for Payment Approval',
          message:     `${rec.full_name}'s payroll (ETB ${parseFloat(rec.net_salary).toLocaleString()}) for month ${rec.month}/${rec.year} has been submitted for payment approval by ${req.admin.name}. Please review and finalize.`,
          relatedType: 'payroll',
          relatedId:   payrollId,
        });
      }
    } catch (_) {}

    return res.json({ success: true, message: 'Payroll submitted for payment approval.' });
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────── *
 * POST /api/payments/:payrollId/initiate
 * Admin initiates the actual Chapa transfer.
 * transition: pending_admin_approval → (stays pending_admin_approval, tx record created)
 * ─────────────────────────────────────────────────────────── */
const initiatePayment = async (req, res, next) => {
  try {
    const { payrollId } = req.params;
    const rec = await getPayrollWithEmployee(payrollId);
    if (!rec) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);

    // Allow retry from 'failed' status by resetting to pending_admin_approval
    if (rec.status === 'failed') {
      await db.query(
        `UPDATE payroll_records SET status='pending_admin_approval', updated_at=NOW() WHERE id=$1`,
        [payrollId]
      );
      rec.status = 'pending_admin_approval';
    }

    if (rec.status !== 'pending_admin_approval')
      throw new AppError('CONFLICT', `Cannot initiate: status is '${rec.status}'. Must be 'pending_admin_approval' or 'failed'.`, 409);

    // Validate bank details
    if (!rec.account_number || !rec.bank_code || !rec.account_name)
      throw new AppError('VALIDATION_ERROR', 'Employee bank account information is incomplete.', 400);

    // Guard against zero or negative amounts — Chapa rejects these
    if (parseFloat(rec.net_salary) <= 0)
      throw new AppError('VALIDATION_ERROR', 'Net salary is zero or negative. Cannot initiate transfer.', 400);

    const txRef = makeTxRef(payrollId, rec.employee_id);

    // Create pending transaction record first
    const txInsert = await db.query(
      `INSERT INTO payment_transactions
         (payroll_id, employee_id, tx_ref, amount, currency,
          account_number, account_name, bank_code, bank_name,
          status, initiated_by, initiated_at)
       VALUES ($1,$2,$3,$4,'ETB',$5,$6,$7,$8,'pending',$9,NOW())
       RETURNING id`,
      [
        payrollId, rec.employee_id, txRef, rec.net_salary,
        rec.account_number, rec.account_name, rec.bank_code, rec.bank_name || '',
        req.admin.id,
      ]
    );
    const txId = txInsert.rows[0].id;

    // Call Chapa
    let chapaResponse;
    try {
      chapaResponse = await chapa.initiateTransfer({
        account_name:   rec.account_name,
        account_number: rec.account_number,
        bank_code:      rec.bank_code,
        amount:         parseFloat(rec.net_salary),
        tx_ref:         txRef,
        reference:      `Salary ${rec.employee_id} ${rec.month}/${rec.year}`,
      });
    } catch (chapaErr) {
      const reason = extractChapaErrorReason(chapaErr);
      const chapaData = chapaErr.response?.data || {};
      const chapaMsg  = typeof chapaData === 'string' ? chapaData : chapaData?.message || reason;

      // Mark transaction as failed if Chapa call throws
      await db.query(
        `UPDATE payment_transactions
         SET status='failed', failure_reason=$1, raw_response=$2, updated_at=NOW()
         WHERE id=$3`,
        [chapaMsg, JSON.stringify(chapaData), txId]
      );
      await db.query(
        `UPDATE payroll_records SET status='failed', updated_at=NOW() WHERE id=$1`,
        [payrollId]
      );
      throw new AppError('PAYMENT_FAILED', `Transfer failed: ${chapaMsg}`, 502);
    }

    // Update tx with Chapa response
    const chapaStatus = chapaResponse?.status;
    const transferId  = chapaResponse?.data?.transfer_id || chapaResponse?.data?.id || null;

    await db.query(
      `UPDATE payment_transactions
       SET chapa_transfer_id=$1, chapa_status=$2, raw_response=$3, updated_at=NOW()
       WHERE id=$4`,
      [transferId, chapaStatus, JSON.stringify(chapaResponse), txId]
    );

    // Update payroll with initiator info
    await db.query(
      `UPDATE payroll_records
       SET payment_initiated_by=$1, payment_initiated_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [req.admin.id, payrollId]
    );

    return res.json({
      success: true,
      message: 'Transfer initiated. Please finalize to confirm payment.',
      data: { tx_ref: txRef, transaction_id: txId, chapa_status: chapaStatus },
    });
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────── *
 * POST /api/payments/:payrollId/verify
 * Admin verifies the transfer and marks payroll paid/failed.
 * ─────────────────────────────────────────────────────────── */
const verifyPayment = async (req, res, next) => {
  try {
    const { payrollId } = req.params;
    const { tx_ref }    = req.body;

    if (!tx_ref) throw new AppError('VALIDATION_ERROR', 'tx_ref is required.', 400);

    const txRes = await db.query(
      `SELECT * FROM payment_transactions WHERE tx_ref=$1 AND payroll_id=$2`,
      [tx_ref, payrollId]
    );
    if (!txRes.rows.length) throw new AppError('NOT_FOUND', 'Transaction not found.', 404);
    const tx = txRes.rows[0];

    // Call Chapa verification
    let verifyData;
    try {
      verifyData = await chapa.verifyTransfer(tx_ref);
    } catch (chapaErr) {
      const reason = extractChapaErrorReason(chapaErr);
      throw new AppError('PAYMENT_VERIFY_FAILED', `Chapa verification failed: ${reason}`, 502);
    }

    // Chapa returns status in verifyData.status or verifyData.data.status
    const chapaStatus = verifyData?.data?.status || verifyData?.status || '';
    const isSuccess   = ['success', 'successful', 'transferred'].includes(chapaStatus.toLowerCase());
    const isFailed    = ['failed', 'error', 'cancelled'].includes(chapaStatus.toLowerCase());

    const newTxStatus       = isSuccess ? 'successful' : isFailed ? 'failed' : 'pending';
    const newPayrollStatus  = isSuccess ? 'paid'       : isFailed ? 'failed' : 'pending_payment';

    await db.query(
      `UPDATE payment_transactions
       SET status=$1, chapa_status=$2, raw_response=$3,
           verified_at=NOW(), updated_at=NOW()
       WHERE id=$4`,
      [newTxStatus, chapaStatus, JSON.stringify(verifyData), tx.id]
    );

    await db.query(
      `UPDATE payroll_records SET status=$1, updated_at=NOW() WHERE id=$2`,
      [newPayrollStatus, payrollId]
    );

    // If payment succeeded, notify the employee
    if (isSuccess) {
      try {
        const pr = await db.query(
          `SELECT employee_id, month, year, net_salary FROM payroll_records WHERE id=$1`,
          [payrollId]
        );
        if (pr.rows.length) {
          const { employee_id, month, year, net_salary } = pr.rows[0];
          const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
          await db.query(
            `INSERT INTO employee_notifications
               (employee_id, type, title, message, payroll_id)
             VALUES ($1, 'salary_paid', $2, $3, $4)`,
            [
              employee_id,
              `Your ${monthName} ${year} salary has been paid`,
              `ETB ${parseFloat(net_salary).toLocaleString()} has been transferred to your bank account. View your payslip for details.`,
              payrollId,
            ]
          );
        }
      } catch (_) {}
    }

    return res.json({
      success: true,
      message: `Payment ${newTxStatus}.`,
      data: {
        tx_ref,
        transaction_status: newTxStatus,
        payroll_status:     newPayrollStatus,
        chapa_status:       chapaStatus,
      },
    });
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────── *
 * POST /api/payments/:payrollId/retry
 * Admin retries a failed payment — re-initiates transfer.
 * ─────────────────────────────────────────────────────────── */
const retryPayment = async (req, res, next) => {
  try {
    const { payrollId } = req.params;
    const rec = await getPayrollWithEmployee(payrollId);
    if (!rec) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);

    if (rec.status !== 'failed')
      throw new AppError('CONFLICT', `Can only retry failed payments. Current status: '${rec.status}'.`, 409);

    // Reset to pending_admin_approval and call initiate
    await db.query(
      `UPDATE payroll_records SET status='pending_admin_approval', updated_at=NOW() WHERE id=$1`,
      [payrollId]
    );

    return initiatePayment(req, res, next);
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────── *
 * POST /api/payments/:payrollId/finalize
 * Admin finalizes the payment after verification.
 * transition: pending_admin_approval → paid
 * Only admin can perform this action.
 * ─────────────────────────────────────────────────────────── */
const finalizePayment = async (req, res, next) => {
  try {
    const { payrollId } = req.params;
    const rec = await getPayrollWithEmployee(payrollId);
    if (!rec) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);

    if (rec.status !== 'pending_admin_approval')
      throw new AppError('CONFLICT', `Cannot finalize: status is '${rec.status}'. Must be 'pending_admin_approval'.`, 409);

    // Get the latest transaction for this payroll
    const txRes = await db.query(
      `SELECT * FROM payment_transactions WHERE payroll_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [payrollId]
    );
    const latestTx = txRes.rows[0] || null;

    // Update payroll status to paid and record finalization details
    await db.query(
      `UPDATE payroll_records
       SET status = 'paid',
           updated_at = NOW(),
           payment_finalized_by = $1,
           payment_finalized_at = NOW(),
           payment_initiated_by = $2,
           payment_initiated_at = NOW()
       WHERE id = $3`,
      [req.admin.id, req.admin.id, payrollId]
    );

    // Notify the employee that payment has been finalized
    try {
      const monthName = new Date(rec.year, rec.month - 1).toLocaleString('default', { month: 'long' });
      const payslipUrl = `/employee/payroll/payment-success`;
      await db.query(
        `INSERT INTO employee_notifications
           (employee_id, type, title, message, payroll_id, extra_data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          rec.employee_id,
          'salary_paid',
          `Your ${monthName} ${rec.year} salary has been paid`,
          `ETB ${parseFloat(rec.net_salary).toLocaleString()} has been transferred to your bank account. View your payslip for details.`,
          payrollId,
          JSON.stringify({ payslip_url: payslipUrl, payroll_id: payrollId.toString() }),
        ]
      );
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Payment finalized successfully.',
      data: {
        payroll_id: payrollId,
        status: 'paid',
        finalized_by: req.admin.name,
        finalized_at: new Date().toISOString(),
        tx_ref: latestTx?.tx_ref || null,
        transaction_id: latestTx?.id || null,
      },
    });
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────── *
 * GET /api/payments/:payrollId/status
 * Returns latest transaction details for a payroll record.
 * ─────────────────────────────────────────────────────────── */
const getPaymentStatus = async (req, res, next) => {
  try {
    const { payrollId } = req.params;

    const txRes = await db.query(
      `SELECT pt.*, a.name AS initiated_by_name
       FROM payment_transactions pt
       LEFT JOIN admins a ON a.id = pt.initiated_by
       WHERE pt.payroll_id = $1
       ORDER BY pt.created_at DESC`,
      [payrollId]
    );

    const prRes = await db.query(
      `SELECT pr.status, pr.payment_submitted_at, pr.payment_initiated_at,
              sub.name AS submitted_by_name, ini.name AS initiated_by_name
       FROM payroll_records pr
       LEFT JOIN admins sub ON sub.id = pr.payment_submitted_by
       LEFT JOIN admins ini ON ini.id = pr.payment_initiated_by
       WHERE pr.id = $1`,
      [payrollId]
    );
    if (!prRes.rows.length) throw new AppError('NOT_FOUND', 'Payroll record not found.', 404);

    return res.json({
      success: true,
      data: {
        payroll:      prRes.rows[0],
        transactions: txRes.rows,
      },
    });
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────── *
 * GET /api/payments/transactions
 * Paginated list of all payment transactions.
 * ─────────────────────────────────────────────────────────── */
const getTransactions = async (req, res, next) => {
  try {
    const { month, year, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['1=1'];
    const params     = [];

    if (status) { params.push(status); conditions.push(`pt.status=$${params.length}`); }
    if (month)  { params.push(month);  conditions.push(`pr.month=$${params.length}`); }
    if (year)   { params.push(year);   conditions.push(`pr.year=$${params.length}`); }

    // Snapshot before adding pagination params
    const filterParams     = [...params];
    const filterConditions = [...conditions];

    params.push(parseInt(limit)); const limitIdx  = params.length;
    params.push(offset);          const offsetIdx = params.length;

    const rows = await db.query(
      `SELECT pt.*, e.full_name, e.designation,
              pr.month, pr.year, pr.net_salary AS payroll_net,
              a.name AS initiated_by_name
       FROM payment_transactions pt
       JOIN employees e ON e.employee_id = pt.employee_id
       JOIN payroll_records pr ON pr.id = pt.payroll_id
       LEFT JOIN admins a ON a.id = pt.initiated_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY pt.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countRes = await db.query(
      `SELECT COUNT(*) FROM payment_transactions pt
       JOIN payroll_records pr ON pr.id = pt.payroll_id
       WHERE ${filterConditions.join(' AND ')}`,
      filterParams
    );

    return res.json({
      success: true,
      data: rows.rows,
      total: parseInt(countRes.rows[0].count),
    });
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────── *
 * GET /api/payments/banks
 * Proxy Chapa bank list to frontend (no key exposed).
 * ─────────────────────────────────────────────────────────── */
const getBanks = async (req, res, next) => {
  try {
    const data = await chapa.getBanks();
    return res.json({ success: true, data: data.data || data });
  } catch (err) { next(err); }
};

module.exports = {
  submitForPayment,
  initiatePayment,
  verifyPayment,
  retryPayment,
  finalizePayment,
  getPaymentStatus,
  getTransactions,
  getBanks,
};
