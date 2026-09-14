const express = require('express');
const router  = express.Router();
const {
  checkIn,
  checkOut,
  getEmployeeStatus,
  getTodayStatus,
  getHistory,
  syncOffline,
} = require('../controllers/attendance.controller');
const { authenticateEmployee } = require('../middleware/auth.middleware');

// Public (QR scan — no login required)
router.get('/status/:employee_id', getEmployeeStatus);
router.post('/check-in',  checkIn);
router.post('/check-out', checkOut);

// Protected
router.get('/today',   authenticateEmployee, getTodayStatus);
router.get('/history', authenticateEmployee, getHistory);
router.post('/sync',   syncOffline);

module.exports = router;
