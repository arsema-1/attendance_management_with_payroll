const db = require('../config/database');
const { AppError } = require('../utils/AppError');

/**
 * Create a notification for one or more admin users.
 * Called internally from other controllers (not an HTTP endpoint).
 *
 * @param {object} opts
 * @param {number|number[]} opts.adminId  - single id or array of ids
 * @param {string} opts.type              - e.g. 'payroll_approval'
 * @param {string} opts.title
 * @param {string} [opts.message]
 * @param {string} [opts.relatedType]     - 'payroll' | 'admin'
 * @param {number} [opts.relatedId]
 */
async function createNotification({ adminId, type, title, message, relatedType, relatedId }) {
  const ids = Array.isArray(adminId) ? adminId : [adminId];
  await Promise.all(ids.map(id =>
    db.query(
      `INSERT INTO notifications (admin_id, type, title, message, related_type, related_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, type, title, message || null, relatedType || null, relatedId || null]
    )
  ));
}

/* ─── GET /api/notifications ──────────────────────────────── */
const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unread_only } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['n.admin_id = $1'];
    const params = [req.admin.id];

    if (unread_only === 'true') {
      conditions.push('n.is_read = FALSE');
    }

    // Pagination params added after filter params
    params.push(parseInt(limit)); // $2 or $3
    params.push(offset);          // $3 or $4

    const rows = await db.query(
      `SELECT n.*
       FROM notifications n
       WHERE ${conditions.join(' AND ')}
       ORDER BY n.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM notifications WHERE ${conditions.join(' AND ')}`,
      [req.admin.id]
    );

    return res.json({
      success: true,
      data: rows.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page:  parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/notifications/unread-count ─────────────────── */
const getUnreadCount = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM notifications WHERE admin_id=$1 AND is_read=FALSE',
      [req.admin.id]
    );
    return res.json({ success: true, data: { count: parseInt(result.rows[0].count) } });
  } catch (err) { next(err); }
};

/* ─── PATCH /api/notifications/:id/read ───────────────────── */
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'UPDATE notifications SET is_read=TRUE WHERE id=$1 AND admin_id=$2 RETURNING *',
      [id, req.admin.id]
    );
    if (!result.rows.length) throw new AppError('NOT_FOUND', 'Notification not found.', 404);
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

/* ─── PATCH /api/notifications/read-all ───────────────────── */
const markAllAsRead = async (req, res, next) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read=TRUE WHERE admin_id=$1 AND is_read=FALSE',
      [req.admin.id]
    );
    return res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) { next(err); }
};

/* ─── DELETE /api/notifications/:id ───────────────────────── */
const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM notifications WHERE id=$1 AND admin_id=$2 RETURNING id',
      [id, req.admin.id]
    );
    if (!result.rows.length) throw new AppError('NOT_FOUND', 'Notification not found.', 404);
    return res.json({ success: true, message: 'Notification deleted.' });
  } catch (err) { next(err); }
};

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
