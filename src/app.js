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
