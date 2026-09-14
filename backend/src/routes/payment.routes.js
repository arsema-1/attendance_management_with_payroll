const express = require('express');
const router  = express.Router();
const {
  submitForPayment,
  initiatePayment,
  verifyPayment,
  retryPayment,
  finalizePayment,
  getPaymentStatus,
  getTransactions,
  getBanks,
} = require('../controllers/payment.controller');
const { authenticateAdmin, requireRole } = require('../middleware/auth.middleware');

router.use(authenticateAdmin);

const adminOnly  = requireRole('super_admin', 'hr_admin');
const hrOrAbove  = requireRole('super_admin', 'hr_admin', 'hr_officer');

// HR Officer: submit finalized payroll for payment approval
router.patch('/:payrollId/submit',   hrOrAbove,  submitForPayment);

// Admin only: initiate, verify, finalize, retry
router.post('/:payrollId/initiate',  adminOnly,  initiatePayment);
router.post('/:payrollId/verify',    adminOnly,  verifyPayment);
router.post('/:payrollId/finalize',  adminOnly,  finalizePayment);
router.post('/:payrollId/retry',     adminOnly,  retryPayment);

// Read access for admin + HR
router.get('/:payrollId/status',     hrOrAbove,  getPaymentStatus);
router.get('/transactions',          hrOrAbove,  getTransactions);
router.get('/banks',                 hrOrAbove,  getBanks);

module.exports = router;
