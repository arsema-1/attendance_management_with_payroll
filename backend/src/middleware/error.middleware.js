const { logger } = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error:   err.code,
      message: err.message,
      ...err.extra,
    });
  }
  logger.error(`Unhandled: ${err.stack}`);
  return res.status(500).json({
    success: false,
    error:   'INTERNAL_ERROR',
    message: process.env.NODE_ENV !== 'production' ? err.message : 'An unexpected error occurred.',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
