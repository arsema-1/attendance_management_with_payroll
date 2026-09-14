const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/AppError');

/**
 * Verify JWT and attach decoded payload to req.user / req.admin
 * Accepts token from Authorization header OR ?token= query param (for file downloads).
 */
const authenticate = (type = 'employee') => (req, res, next) => {
  const header = req.headers.authorization;
  let token = null;
  if (header?.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.query?.token) {
    token = req.query.token;
  }
  if (!token)
    return next(new AppError('UNAUTHORIZED', 'Authentication token required.', 401));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== type)
      return next(new AppError('FORBIDDEN', `${type} token required.`, 403));

    if (type === 'admin') req.admin = decoded;
    else req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return next(new AppError('TOKEN_EXPIRED', 'Session expired. Please log in again.', 401));
    return next(new AppError('INVALID_TOKEN', 'Invalid token.', 401));
  }
};

const authenticateEmployee = authenticate('employee');
const authenticateAdmin    = authenticate('admin');

/** Authenticate either role for endpoints that safely scope their own data. */
const authenticateUser = (req, res, next) => {
  const header = req.headers.authorization;
  let token = null;
  if (header?.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.query?.token) {
    token = req.query.token;
  }
  if (!token)
    return next(new AppError('UNAUTHORIZED', 'Authentication token required.', 401));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!['employee', 'admin'].includes(decoded.type))
      return next(new AppError('FORBIDDEN', 'A valid user token is required.', 403));
    if (decoded.type === 'admin') req.admin = decoded;
    else req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return next(new AppError('TOKEN_EXPIRED', 'Session expired. Please log in again.', 401));
    return next(new AppError('INVALID_TOKEN', 'Invalid token.', 401));
  }
};

/** Require specific admin role(s) */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.admin?.role))
    return next(new AppError('FORBIDDEN', 'Insufficient permissions.', 403));
  next();
};

module.exports = { authenticateEmployee, authenticateAdmin, authenticateUser, requireRole };
