const express = require('express');
const auth = require('../controllers/authController');
const { redirectIfLoggedIn } = require('../middleware/auth');
const { provideCsrfToken } = require('../middleware/security');
const { loginLimiter, passwordResetLimiter } = require('../middleware/rateLimits');

const router = express.Router();

// Login and password pages shouldn't appear in search results.
const noindex = (req, res, next) => {
  res.locals.noindex = true;
  next();
};
router.use(['/login', '/forgot-password', '/reset-password'], noindex);

router.get('/login', redirectIfLoggedIn, provideCsrfToken, auth.showLogin);
router.post('/login', loginLimiter, provideCsrfToken, auth.loginRules, auth.login);

router.post('/logout', auth.logout);

router.get('/forgot-password', redirectIfLoggedIn, provideCsrfToken, auth.showForgot);
router.post('/forgot-password', passwordResetLimiter, provideCsrfToken, auth.forgotRules, auth.forgot);

router.get('/reset-password/:token', provideCsrfToken, auth.showReset);
router.post('/reset-password/:token', passwordResetLimiter, provideCsrfToken, auth.resetRules, auth.reset);

module.exports = router;
