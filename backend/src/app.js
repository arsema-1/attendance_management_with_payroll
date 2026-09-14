const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const authRoutes       = require('./routes/auth.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const faceRoutes       = require('./routes/face.routes');
const leaveRoutes      = require('./routes/leave.routes');
const adminRoutes      = require('./routes/admin.routes');
const payrollRoutes    = require('./routes/payroll.routes');
const paymentRoutes    = require('./routes/payment.routes');
const notificationRoutes = require('./routes/notification.routes');
const empNotifRoutes     = require('./routes/employee.notification.routes');
const { errorHandler } = require('./middleware/error.middleware');
const { logger }       = require('./utils/logger');

const app = express();

// ─── Security headers ─────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS ────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3500,http://localhost:3000,http://localhost:3001').split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ─── Body parsers ─────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── HTTP logger ──────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ─── Global rate limiter ──────────────────────────────────────
app.use(rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'RATE_LIMIT', message: 'Too many requests.' },
}));

// ─── Auth rate limiter (stricter) ─────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,   // 15 minutes
  max: 10,
  message: { success: false, error: 'RATE_LIMIT', message: 'Too many login attempts.' },
});

// ─── Attendance limiter (no-login QR endpoint) ────────────────
const attendLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: { success: false, error: 'RATE_LIMIT', message: 'Slow down.' },
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',       authLimiter,   authRoutes);
app.use('/api/attendance', attendLimiter, attendanceRoutes);
app.use('/api/face',                      faceRoutes);
app.use('/api/leave',                     leaveRoutes);
app.use('/api/admin',                     adminRoutes);
app.use('/api/payroll',                   payrollRoutes);
app.use('/api/payments',                  paymentRoutes);
app.use('/api/notifications',             notificationRoutes);
app.use('/api/employee/notifications',   empNotifRoutes);

// ─── Health ───────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status: 'ok',
  service: 'Manikstu Agro API',
  timestamp: new Date().toISOString(),
}));

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({
  success: false, error: 'NOT_FOUND', message: 'Route not found.',
}));

// ─── Error handler ────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
