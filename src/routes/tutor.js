const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const content = require('../services/content');
const { buildDocumentLibrary } = require('../services/documentLibrary');
const sections = require('../config/tutorSections');
const account = require('../controllers/accountController');
const { changePasswordLimiter } = require('../middleware/rateLimits');

const router = express.Router();

// Admins may also open the tutor area to see what tutors see.
router.use(requireLogin, requireRole('TUTOR', 'ADMIN'), (req, res, next) => {
  res.locals.noindex = true;
  res.locals.tutorNavigation = [
    { label: 'Overview', href: '/tutor', active: req.path === '/' },
    ...sections.map((section) => ({ label: section.label, href: section.href, active: '/tutor' + req.path === section.href })),
  ];
  next();
});

router.get('/', async (req, res) => {
  const { page, sections } = await content.getTutorPortal();
  res.render('tutor/dashboard', {
    title: page.title, page, sections,
  });
});

for (const section of sections) {
  router.get(section.href.replace('/tutor', ''), async (req, res) => {
    const [page, groups] = await Promise.all([
      content.getPage(section.pageSlug), content.getDocuments(['PUBLIC', 'TUTORS'], section.value),
    ]);
    res.render('tutor/resources', {
      title: page.title, page, section, library: buildDocumentLibrary(groups, req.query),
      isAdminPreview: req.user.role === 'ADMIN',
    });
  });
}

router.get('/password', account.showChangePassword);
router.post('/password', changePasswordLimiter, account.changePasswordRules, account.changePassword);

module.exports = router;
