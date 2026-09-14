const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { authenticateEmployee } = require('../middleware/auth.middleware');

router.use(authenticateEmployee);

// GET /api/employee/notifications
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM employee_notifications
       WHERE employee_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.employee_id]
    );
    const unread = rows.rows.filter(n => !n.is_read).length;
    res.json({ success: true, data: rows.rows, unread });
  } catch (err) { next(err); }
});

// PATCH /api/employee/notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE employee_notifications SET is_read=TRUE
       WHERE id=$1 AND employee_id=$2`,
      [req.params.id, req.user.employee_id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/employee/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE employee_notifications SET is_read=TRUE WHERE employee_id=$1`,
      [req.user.employee_id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
