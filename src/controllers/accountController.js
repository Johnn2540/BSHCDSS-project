// Change password for the logged-in user. Requires the current password, so someone who
// finds an unattended logged-in session can't lock the owner out.
// On success, every other session for the account is ended; the current one stays logged in.

const bcrypt = require('bcrypt');
const { body } = require('express-validator');

const { prisma, pool } = require('../lib/db');
const { collectErrors } = require('../admin/fields');
const { BCRYPT_ROUNDS, MIN_PASSWORD_LENGTH } = require('../config/auth');

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Enter your current password.'),
  body('newPassword')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
    .bail()
    .isLength({ max: 72 })
    .withMessage('New password must be 72 characters or fewer.')
    .bail()
    .custom((value, { req }) => value !== req.body.currentPassword)
    .withMessage('New password must be different from your current password.'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('The two new passwords do not match.'),
];

const promisify = (fn) => new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));

function render(res, { errors = {}, status = 200 } = {}) {
  // Password fields are never sent back to the browser, even after an error.
  res.status(status).render('admin/password', { title: 'Change password', errors, minLength: MIN_PASSWORD_LENGTH });
}

function showChangePassword(req, res) {
  render(res);
}

async function changePassword(req, res) {
  const errors = collectErrors(req);
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, passwordHash: true } });

  // Always verify the current password (even if other fields have errors) so the response
  // reports everything that needs fixing at once.
  if (req.body.currentPassword && !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    errors.currentPassword = 'Your current password is incorrect.';
  }
  if (Object.keys(errors).length) return render(res, { errors, status: 422 });

  const passwordHash = await bcrypt.hash(req.body.newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
  ]);

  // Sign out every other device, then give this session a fresh ID.
  await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1 AND sid <> $2`, [user.id, req.sessionID]);
  await promisify((cb) => req.session.regenerate(cb));
  req.session.userId = user.id;
  req.flash('success', 'Your password has been changed. Any other devices where you were logged in have been signed out.');
  await promisify((cb) => req.session.save(cb));

  res.redirect('/admin/password');
}

module.exports = { changePasswordRules, showChangePassword, changePassword };
