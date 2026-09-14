const express = require('express');
const router  = express.Router();
const {
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
} = require('../controllers/payroll.controller');
const {
  authenticateAdmin,
  authenticateUser,
  requireRole,
} = require('../middleware/auth.middleware');

// ── HR Officer + Admin (payroll preparation) ──────────────────
const hrOrAbove = requireRole('super_admin', 'hr_admin', 'hr_officer');
const adminOnly = requireRole('super_admin', 'hr_admin');   // payment approval = admin only

router.post('/generate',      authenticateAdmin, hrOrAbove, generatePayroll);
router.get('/summary',        authenticateAdmin, getPayrollSummary);
router.get('/export',         authenticateAdmin, exportPayroll);
router.post('/:id/items',     authenticateAdmin, hrOrAbove, addPayrollItem);
router.delete('/:id/items/:itemId', authenticateAdmin, hrOrAbove, deletePayrollItem);
router.get('/slip/:id/pdf',   authenticateUser, downloadPayslipPdf);

// Status transitions — HR can move draft→finalized; admin moves finalized→pending_payment→paid
router.patch('/:id/status',   authenticateAdmin, updateStatus);        // controller enforces role
router.patch('/bulk-status',  authenticateAdmin, bulkUpdateStatus);    // controller enforces role

// ── Approval workflow (HR submits, Admin approves) ────────────
router.post('/submit-for-approval',  authenticateAdmin, submitForApproval);
router.get('/pending-approvals',     authenticateAdmin, getPendingApprovals);
router.post('/:id/approve',          authenticateAdmin, approvePayroll);
router.post('/:id/reject',           authenticateAdmin, rejectPayroll);
router.post('/bulk-approve',         authenticateAdmin, bulkApprove);
router.post('/bulk-reject',          authenticateAdmin, bulkReject);

// ── Accessible by both admin and employee ─────────────────────
router.get('/list',           authenticateUser, getPayrollList);
router.get('/report',         authenticateUser, getPayrollReport);
router.get('/history',        authenticateUser, getHistory);
router.get('/slip/:id',       authenticateUser, getPayslip);

module.exports = router;
