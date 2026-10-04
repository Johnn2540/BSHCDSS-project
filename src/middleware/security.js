const crypto = require('crypto');
const helmet = require('helmet');
const { csrfSync } = require('csrf-sync');

const isProd = process.env.NODE_ENV === 'production';

// Per-request nonce so the small inline script in the layout passes the CSP.
function cspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      'script-src': ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      'img-src': ["'self'", 'data:', 'https://res.cloudinary.com', 'https://img.youtube.com'],
      'media-src': ["'self'", 'https://res.cloudinary.com'],
      'frame-src': ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'],
      'upgrade-insecure-requests': isProd ? [] : null,
    },
  },
});

// The token is read from the form body, or from the query string for multipart (file upload)
// forms, whose body isn't parsed until multer runs inside the route.
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => (req.body && req.body._csrf) || req.query._csrf || req.headers['x-csrf-token'],
  size: 32,
});

// Puts a CSRF token in the view. Used on pages with forms and for logged-in users,
// so anonymous visitors browsing public pages don't get a session created.
function provideCsrfToken(req, res, next) {
  res.locals.csrfToken = generateToken(req);
  next();
}

function csrfTokenForUsers(req, res, next) {
  if (req.user) res.locals.csrfToken = generateToken(req);
  next();
}

module.exports = {
  cspNonce,
  helmet: helmetMiddleware,
  csrfProtection: csrfSynchronisedProtection,
  provideCsrfToken,
  csrfTokenForUsers,
};
