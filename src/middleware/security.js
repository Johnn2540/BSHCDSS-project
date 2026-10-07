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

function privatePages(req, res, next) {
  if (req.user || /^\/(admin|tutor|login|forgot-password|reset-password|request-tutor-access)(\/|$)/.test(req.path)) {
    res.set('Cache-Control', 'private, no-store');
  }
  next();
}

// Public pages with no forms and nothing personal can be kept by the CDN for a minute, so most anonymous visits skip
// the server and database. Only cookie-less GETs of these exact paths qualify: anyone with a session cookie (or a
// query string) is always served fresh, and the response must not set a cookie. Admin edits show within about a minute.
const EDGE_CACHED_PATHS = new Set(['/', '/about', '/team', '/gallery', '/announcements', '/activities/lms', '/activities/in-service-training', '/activities/cpd']);
function edgeCachePublic(req, res, next) {
  if (process.env.VERCEL && req.method === 'GET' && !req.user && !req.headers.cookie && !req.url.includes('?') && EDGE_CACHED_PATHS.has(req.path)) {
    res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.vary('Cookie');
    // Never let a response that sets a cookie be shared.
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      if (res.getHeader('Set-Cookie')) res.setHeader('Cache-Control', 'private, no-store');
      return writeHead.apply(this, args);
    };
  }
  next();
}

module.exports = {
  edgeCachePublic,
  cspNonce,
  helmet: helmetMiddleware,
  csrfProtection: csrfSynchronisedProtection,
  provideCsrfToken,
  csrfTokenForUsers,
  privatePages,
};
