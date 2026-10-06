const path = require('path');
const express = require('express');
const { engine } = require('express-handlebars');

const helpers = require('./helpers/handlebars');
const { pool } = require('./lib/db');
const routes = require('./routes');
const security = require('./middleware/security');
const { sessionMiddleware } = require('./middleware/session');
const flash = require('./middleware/flash');
const { loadUser } = require('./middleware/auth');
const siteLocals = require('./middleware/siteLocals');
const notifications = require('./controllers/notificationsController');
const seoController = require('./controllers/seoController');
const seoMiddleware = require('./middleware/seo');
const { notFound, errorHandler } = require('./middleware/errorHandlers');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Behind a proxy (e.g. Render, Railway) in production so secure cookies and req.ip work.
if (isProd) app.set('trust proxy', 1);

// View engine
app.engine(
  'hbs',
  engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views', 'layouts'),
    partialsDir: path.join(__dirname, 'views', 'partials'),
    helpers,
  })
);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Security headers
app.use(security.cspNonce);
app.use(security.helmet);
app.use(seoMiddleware.indexingRules);
app.use(seoMiddleware.canonicalPaths);

// Static assets (built CSS, JS, images). Served before sessions so assets never touch the DB.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: isProd ? '7d' : 0,
  })
);

// Health check for the hosting platform (no session, no page rendering).
app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.type('text/plain').send('ok');
  } catch {
    res.status(503).type('text/plain').send('database unavailable');
  }
});

// Public, read-only JSON: avoid sessions and unrelated page-content queries.
app.get('/api/public/notifications', notifications.feed);
// Crawlers don't need sessions, notification queries or page rendering.
app.get('/robots.txt', seoController.robots);
app.get('/sitemap.xml', seoController.sitemap);

// Body parsing
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

// Sessions, flash messages, current user, CSRF
app.use(sessionMiddleware);
app.use(flash);
app.use(loadUser);
app.use(security.privatePages);
app.use(security.csrfProtection);
app.use(security.csrfTokenForUsers);

// Site-wide view data (site settings, partners, navigation)
app.use(siteLocals);

// Routes
app.use('/', routes);

// Errors
app.use(notFound);
app.use(errorHandler);

module.exports = app;
