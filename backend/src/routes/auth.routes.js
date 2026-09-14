// routes/auth.routes.js
const express = require('express');
const router  = express.Router();
const { employeeLogin, adminLogin, registerEmployee } = require('../controllers/auth.controller');
const { authenticateAdmin, requireRole } = require('../middleware/auth.middleware');

router.post('/login',        employeeLogin);
router.post('/admin/login',  adminLogin);
router.post('/register',     authenticateAdmin, requireRole('super_admin', 'hr_admin'), registerEmployee);

// Admin account management — super_admin only
const { createAdminAccount } = require('../controllers/auth.controller');
router.post('/admin/create', authenticateAdmin, requireRole('super_admin'), createAdminAccount);

// List admin accounts — super_admin only
router.get('/admin/list', authenticateAdmin, requireRole('super_admin'), async (req, res, next) => {
  try {
    const db = require('../config/database');
    const rows = await db.query(
      'SELECT id, name, email, role, is_active, last_login_at, created_at FROM admins ORDER BY created_at DESC'
    );
    return res.json({ success: true, admins: rows.rows });
  } catch (err) { next(err); }
});

module.exports = router;
