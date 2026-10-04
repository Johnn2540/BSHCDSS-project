const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const content = require('../services/content');
const { buildDocumentLibrary } = require('../services/documentLibrary');

const router = express.Router();

// Admins may also open the tutor area to see what tutors see.
router.use(requireLogin, requireRole('TUTOR', 'ADMIN'), (req, res, next) => {
  res.locals.noindex = true;
  next();
});

router.get('/', async (req, res) => {
  const [page, groups] = await Promise.all([
    content.getPage('curriculum'), content.getDocuments(['PUBLIC', 'TUTORS']),
  ]);
  res.render('tutor/dashboard', {
    title: 'Tutor dashboard', page, library: buildDocumentLibrary(groups, req.query),
  });
});

module.exports = router;
