const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const { pool } = require('../lib/db');
const { SESSION_MAX_AGE_MS } = require('../config/auth');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add a long random string to .env.');
}

const SESSION_COOKIE_NAME = 'bshcdss.sid';

const sessionMiddleware = session({
  store: new PgStore({
    pool,
    tableName: 'session', // created by the Prisma migration (model Session)
    createTableIfMissing: false,
    pruneSessionInterval: 60 * 15, // seconds
  }),
  name: SESSION_COOKIE_NAME,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
  },
});

module.exports = { sessionMiddleware, SESSION_COOKIE_NAME };
