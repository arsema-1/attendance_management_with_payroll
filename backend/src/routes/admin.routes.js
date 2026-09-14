const express = require('express');
const router  = express.Router();
const {
  getDashboard, getReports, addEmployee, getEmployees,
  updateEmployee, deactivateEmployee, getAllLeaves,
  updateEmployeeBankInfo,
} = require('../controllers/admin.controller');
const { reviewLeave } = require('../controllers/leave.controller');
const { authenticateAdmin, requireRole } = require('../middleware/auth.middleware');

router.use(authenticateAdmin);

// All admin roles can read these (view-only for super_admin)
router.get('/dashboard',   getDashboard);
router.get('/reports',     getReports);
router.get('/employees',   getEmployees);
router.get('/leave',       getAllLeaves);

// HR roles only: add, edit, deactivate employees and manage bank info / leave
const hrOnly = requireRole('hr_officer', 'hr_admin');
router.post('/employee/add',             hrOnly, addEmployee);
router.patch('/employee/:id',            hrOnly, updateEmployee);
router.patch('/employee/:id/deactivate', hrOnly, deactivateEmployee);
router.patch('/employee/:id/bank',       hrOnly, updateEmployeeBankInfo);
router.patch('/leave/:id/review',        hrOnly, reviewLeave);

module.exports = router;
