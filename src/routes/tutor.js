const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

// Admins may also open the tutor area to see what tutors see.
router.use(requireLogin, requireRole('TUTOR', 'ADMIN'), (req, res, next) => {
  res.locals.noindex = true;
  next();
});

router.get('/', (req, res) => {
  res.render('tutor/dashboard', { title: 'Tutor dashboard' });
});

module.exports = router;
