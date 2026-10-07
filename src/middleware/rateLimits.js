const rateLimit = require('express-rate-limit');

// In-memory store: fine for a single server instance. Use a shared store if scaled out.
function limiter({ windowMs, limit, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).render('public/error', {
        title: 'Too many attempts',
        status: 429,
        message: 'Too many attempts. Please wait a few minutes and try again.',
      });
    },
  });
}

module.exports = {
  // Failed logins only; a successful login doesn't count against the limit.
  loginLimiter: limiter({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true }),
  passwordResetLimiter: limiter({ windowMs: 60 * 60 * 1000, limit: 5 }),
  contactLimiter: limiter({ windowMs: 60 * 60 * 1000, limit: 5 }),
  // Requests for a tutor account; every submission counts, valid or not.
  tutorRequestLimiter: limiter({ windowMs: 60 * 60 * 1000, limit: 5 }),
  // Guesses at the current password on the change-password form; successful changes don't count.
  changePasswordLimiter: limiter({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true }),
};
