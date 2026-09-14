const db  = require('../config/database');
const { AppError }    = require('../utils/AppError');
const { isWithinOffice } = require('../services/gps.service');

/* ─── helper: read DB setting ─────────────────────────────── */
async function getSetting(key) {
  const r = await db.query('SELECT value FROM system_settings WHERE key = $1', [key]);
  return r.rows[0]?.value;
}

async function isLateArrival(checkInTime) {
  const threshold = await getSetting('late_threshold') || '09:30';
  const [h, m]    = threshold.split(':').map(Number);
  const t         = new Date(checkInTime);
  return t.getHours() > h || (t.getHours() === h && t.getMinutes() > m);
}

/* ─── POST /api/attendance/check-in ──────────────────────── */
const checkIn = async (req, res, next) => {
  try {
    const {
      employee_id, latitude, longitude,
      device_id, method = 'qr', is_offline_record = false,
    } = req.body;

    const identifier = String(employee_id || '').trim();
    if (!identifier) throw new AppError('VALIDATION_ERROR', 'employee_id is required.', 400);

    // Verify employee exists
    const empRes = await db.query(
      `SELECT employee_id, full_name FROM employees
       WHERE (employee_id = $1 OR phone = $1 OR LOWER(email) = LOWER($1)) AND is_active = TRUE`,
      [identifier]
    );
    if (!empRes.rows.length)
      throw new AppError('NOT_FOUND', 'Employee not found or inactive.', 404);

    const today = new Date().toISOString().split('T')[0];
    const now   = new Date();

    // GPS verification — check distance from office
    let gpsVerified = false;
    let gpsDistance = null;
    let gpsAllowed  = true;
    if (!is_offline_record && latitude != null && longitude != null) {
      const result = isWithinOffice(parseFloat(latitude), parseFloat(longitude));
      gpsVerified = true;
      gpsAllowed  = result.allowed;
      gpsDistance = result.distance;
      // Warn but do not block — admin can review gps_verified=false records
    }

    // Prevent duplicate check-in
    const existing = await db.query(
      'SELECT check_in_time FROM attendance WHERE employee_id = $1 AND date = $2',
      [empRes.rows[0].employee_id, today]
    );
    if (existing.rows.length)
      throw new AppError('DUPLICATE_CHECKIN',
        `Already checked in at ${new Date(existing.rows[0].check_in_time).toLocaleTimeString()}.`,
        409, { checked_in_at: existing.rows[0].check_in_time });

    const late        = await isLateArrival(now);
    const lateMinutes = late ? calcLateMinutes(now, await getSetting('late_threshold')) : 0;
    const ip          = req.ip || req.headers['x-forwarded-for'];

    const result = await db.query(
      `INSERT INTO attendance
         (employee_id, date, check_in_time, checkin_lat, checkin_lng, gps_verified,
          device_id, ip_address, method, is_late, late_minutes, is_offline_record, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'present')
       RETURNING *`,
      [empRes.rows[0].employee_id, today, now.toISOString(),
       latitude ?? null, longitude ?? null, gpsVerified,
       device_id || null, ip, method, late, lateMinutes, is_offline_record]
    );

    return res.status(201).json({
      success: true,
      message: 'Check-in recorded.',
      data: {
        ...result.rows[0],
        employee_name: empRes.rows[0].full_name,
        is_late: late,
        late_minutes: lateMinutes,
        gps_within_office: gpsAllowed,
        distance_from_office: gpsDistance,
      },
    });
  } catch (err) { next(err); }
};

/* ─── POST /api/attendance/check-out ─────────────────────── */
const checkOut = async (req, res, next) => {
  try {
    const { employee_id, latitude, longitude, device_id } = req.body;
    const identifier = String(employee_id || '').trim();
    if (!identifier) throw new AppError('VALIDATION_ERROR', 'employee_id is required.', 400);

    const today = new Date().toISOString().split('T')[0];
    const now   = new Date();

    // GPS — record coordinates and check distance
    let gpsDistance = null;
    let gpsAllowed  = true;
    if (latitude != null && longitude != null) {
      const result = isWithinOffice(parseFloat(latitude), parseFloat(longitude));
      gpsAllowed  = result.allowed;
      gpsDistance = result.distance;
    }

    const rec = await db.query(
      `SELECT a.* FROM attendance a
       JOIN employees e ON e.employee_id = a.employee_id
       WHERE (e.employee_id = $1 OR e.phone = $1 OR LOWER(e.email) = LOWER($1)) AND a.date = $2`,
      [identifier, today]
    );
    if (!rec.rows.length)
      throw new AppError('NOT_CHECKED_IN', 'No check-in found for today.', 400);
    if (rec.rows[0].check_out_time)
      throw new AppError('ALREADY_CHECKED_OUT', 'Already checked out today.', 409);

    const updated = await db.query(
      `UPDATE attendance
       SET check_out_time = $1, checkout_lat = $2, checkout_lng = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [now.toISOString(), latitude ?? null, longitude ?? null, rec.rows[0].id]
    );

    const wm = updated.rows[0].working_minutes;
    return res.json({
      success: true,
      message: 'Check-out recorded.',
      data: {
        ...updated.rows[0],
        working_hours: wm ? `${Math.floor(wm/60)}h ${wm%60}m` : null,
        gps_within_office: gpsAllowed,
        distance_from_office: gpsDistance,
      },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/attendance/status/:employee_id ───────────── */
const getEmployeeStatus = async (req, res, next) => {
  try {
    const { employee_id } = req.params;
    if (!employee_id) throw new AppError('VALIDATION_ERROR', 'employee_id is required.', 400);

    const emp = await db.query(
      `SELECT employee_id, full_name, phone, email, is_active
       FROM employees
       WHERE (employee_id = $1 OR phone = $1 OR LOWER(email) = LOWER($1)) AND is_active = TRUE`,
      [employee_id]
    );

    if (!emp.rows.length)
      throw new AppError('NOT_FOUND', 'Employee not found or inactive.', 404);

    const employee = emp.rows[0];
    const today = new Date().toISOString().split('T')[0];
    const rec = await db.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
      [employee.employee_id, today]
    );

    let status = 'not_checked_in';
    if (rec.rows.length) {
      status = rec.rows[0].check_out_time ? 'checked_out' : 'checked_in';
    }

    return res.json({
      success: true,
      data: {
        employee_id: employee.employee_id,
        employee_name: employee.full_name,
        status,
        check_in_time: rec.rows[0]?.check_in_time || null,
        check_out_time: rec.rows[0]?.check_out_time || null,
      },
    });
  } catch (err) { next(err); }
};

/* ─── GET /api/attendance/today ──────────────────────────── */
const getTodayStatus = async (req, res, next) => {
  try {
    const { employee_id } = req.user;
    const today = new Date().toISOString().split('T')[0];
    const rec   = await db.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
      [employee_id, today]
    );
    return res.json({ success: true, data: rec.rows[0] || null });
  } catch (err) { next(err); }
};

/* ─── GET /api/attendance/history ────────────────────────── */
const getHistory = async (req, res, next) => {
  try {
    const { employee_id } = req.user;
    const { from, to, page = 1, limit = 30 } = req.query;
    const fromDate = from || new Date(Date.now() - 30*86400_000).toISOString().split('T')[0];
    const toDate   = to   || new Date().toISOString().split('T')[0];
    const offset   = (parseInt(page)-1) * parseInt(limit);

    const rows = await db.query(
      `SELECT * FROM attendance
       WHERE employee_id = $1 AND date BETWEEN $2 AND $3
       ORDER BY date DESC LIMIT $4 OFFSET $5`,
      [employee_id, fromDate, toDate, parseInt(limit), offset]
    );

    const count = await db.query(
      'SELECT COUNT(*) FROM attendance WHERE employee_id = $1 AND date BETWEEN $2 AND $3',
      [employee_id, fromDate, toDate]
    );

    return res.json({
      success: true,
      data: rows.rows.map(r => ({
        ...r,
        working_hours: r.working_minutes
          ? `${Math.floor(r.working_minutes/60)}h ${r.working_minutes%60}m` : null,
      })),
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total: parseInt(count.rows[0].count),
        pages: Math.ceil(parseInt(count.rows[0].count)/parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};

/* ─── POST /api/attendance/sync  (offline batch upload) ───── */
const syncOffline = async (req, res, next) => {
  try {
    const { records } = req.body; // array of { employee_id, check_in_time, check_out_time, date, method }
    if (!Array.isArray(records) || !records.length)
      throw new AppError('VALIDATION_ERROR', 'records array required.', 400);

    const results = { synced: 0, skipped: 0, errors: [] };

    for (const r of records) {
      try {
        const inserted = await db.query(
          `INSERT INTO attendance
             (employee_id, date, check_in_time, check_out_time, method, is_offline_record, synced_at, status)
           VALUES ($1,$2,$3,$4,$5,TRUE,NOW(),'present')
           ON CONFLICT (employee_id, date) DO NOTHING`,
          [r.employee_id, r.date, r.check_in_time, r.check_out_time || null, r.method || 'offline_sync']
        );
        if (inserted.rowCount) results.synced++;
        else results.skipped++;
      } catch (e) {
        results.errors.push({ date: r.date, error: e.message });
        results.skipped++;
      }
    }

    return res.json({ success: true, results });
  } catch (err) { next(err); }
};

function calcLateMinutes(now, threshold = '09:30') {
  const [h, m] = threshold.split(':').map(Number);
  const threshMs = (h * 60 + m) * 60_000;
  const nowMs    = (now.getHours() * 60 + now.getMinutes()) * 60_000;
  return Math.max(0, Math.floor((nowMs - threshMs) / 60_000));
}

module.exports = { checkIn, checkOut, getEmployeeStatus, getTodayStatus, getHistory, syncOffline };
