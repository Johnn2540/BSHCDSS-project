const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

const { prisma, pool } = require('../lib/db');
const { findValidToken, sendResetEmail } = require('../services/passwordTokens');
const { SESSION_COOKIE_NAME } = require('../middleware/session');
const { BCRYPT_ROUNDS, MIN_PASSWORD_LENGTH, HOME_BY_ROLE } = require('../config/auth');

// Compared against when the email doesn't exist, so response time doesn't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// Only allow same-site relative paths, and never send a tutor to an admin URL.
function safeReturnTo(returnTo, role) {
  const fallback = HOME_BY_ROLE[role];
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.startsWith('/\\')) {
    return fallback;
  }
  if (returnTo.startsWith('/admin') && role !== 'ADMIN') return fallback;
  return returnTo;
}

const promisify = (fn) => new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));

// ─── Validation rules ─────────────────────────────────────────────────────────

// Emails are stored trimmed and lowercased; no other normalisation (e.g. Gmail dots/+tags).
const emailRule = () =>
  body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Enter a valid email address.')
    .isLength({ max: 254 });

const loginRules = [emailRule(), body('password').notEmpty().withMessage('Enter your password.')];

const forgotRules = [emailRule()];

const resetRules = [
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
    .isLength({ max: 72 })
    .withMessage('Password must be 72 characters or fewer.'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match.'),
];

// ─── Login / logout ───────────────────────────────────────────────────────────

function showLogin(req, res) {
  res.render('auth/login', { title: 'Login' });
}

async function login(req, res) {
  const email = req.body.email || '';
  const fail = (message, status = 401) =>
    res.status(status).render('auth/login', { title: 'Login', email, error: message });

  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail(errors.array()[0].msg, 422);

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = await bcrypt.compare(req.body.password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordOk) return fail('Incorrect email or password.');
  // Account status is only revealed after the correct password has been given.
  if (user.status === 'PENDING') return fail('Your account is awaiting approval by an administrator.', 403);
  if (user.status === 'SUSPENDED') {
    return fail('Your account has been suspended. Please contact the project administrator.', 403);
  }

  const returnTo = safeReturnTo(req.session.returnTo, user.role);

  // New session ID on login prevents session fixation.
  await promisify((cb) => req.session.regenerate(cb));
  req.session.userId = user.id;
  await promisify((cb) => req.session.save(cb));

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  res.redirect(returnTo);
}

async function logout(req, res) {
  await promisify((cb) => req.session.destroy(cb));
  res.clearCookie(SESSION_COOKIE_NAME);
  res.redirect('/');
}

// ─── Forgot / reset password ──────────────────────────────────────────────────

function showForgot(req, res) {
  res.render('auth/forgot-password', { title: 'Forgot password' });
}

async function forgot(req, res) {
  const email = req.body.email || '';
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('auth/forgot-password', {
      title: 'Forgot password',
      email,
      error: errors.array()[0].msg,
    });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.status === 'ACTIVE') {
    try {
      await sendResetEmail(req, user);
    } catch (err) {
      console.error('Password reset email failed:', err);
    }
  }

  // Same response whether or not the account exists.
  res.render('auth/forgot-password', { title: 'Forgot password', sent: true });
}

async function showReset(req, res) {
  const record = await findValidToken(req.params.token);
  res.render('auth/reset-password', { title: 'Reset password', invalid: !record, token: req.params.token });
}

async function reset(req, res) {
  const { token } = req.params;
  const record = await findValidToken(token);
  if (!record) return res.status(400).render('auth/reset-password', { title: 'Reset password', invalid: true });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('auth/reset-password', { title: 'Reset password', token, error: errors.array()[0].msg });
  }

  const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } }),
  ]);

  // Log the user out everywhere after a password change.
  await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [record.userId]);

  req.flash('success', 'Your password has been reset. You can now log in.');
  res.redirect('/login');
}

module.exports = {
  loginRules,
  forgotRules,
  resetRules,
  showLogin,
  login,
  logout,
  showForgot,
  forgot,
  showReset,
  reset,
};
