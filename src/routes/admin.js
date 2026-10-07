const express = require('express');
const { requireLogin, requirePermission } = require('../middleware/auth');
const { permissionsFor } = require('../services/permissions');
const content = require('../services/content');
const adminNavigation = require('../config/adminNavigation');
const { MAX_REQUEST_BYTES } = require('../middleware/upload');
const { crudRouter } = require('../admin/crud');
const resources = require('../admin/resources');
const { dashboard } = require('../controllers/admin/dashboardController');
const pages = require('../controllers/admin/pagesController');
const tutors = require('../controllers/admin/tutorsController');
const tutorRequests = require('../controllers/admin/tutorRequestsController');
const account = require('../controllers/accountController');
const { changePasswordLimiter } = require('../middleware/rateLimits');

const router = express.Router();

router.use(requireLogin, requirePermission('manageContent'));

// Protect the entire account-management subtree, including direct POST requests
// and any future tutor actions. Delegated tutors have no account permissions.
router.use('/tutors', requirePermission('manageAccounts'));
router.use('/tutor-requests', requirePermission('manageAccounts'));

router.use((req, res, next) => {
  res.locals.layout = 'admin';
  const permissions = permissionsFor(req.user);
  res.locals.adminNavigation = adminNavigation.filter(item => !item.permission || permissions[item.permission]);
  res.locals.maxUploadBytes = MAX_REQUEST_BYTES; // set on Vercel only; checked in the browser
  // Any change made in the admin panel clears the public content cache.
  if (req.method === 'POST') res.on('finish', content.clearCache);
  next();
});

router.get('/', dashboard);

// Your account
router.get('/password', account.showChangePassword);
router.post('/password', changePasswordLimiter, account.changePasswordRules, account.changePassword);

// Page content (edit only)
router.get('/pages', pages.list);
router.get('/pages/:slug/edit', pages.editForm);
router.post('/pages/:slug', pages.upload, pages.validate, pages.update);

// Tutors
router.get('/tutors', tutors.list);
router.get('/tutors/new', tutors.newForm);
router.post('/tutors', tutors.createRules, tutors.create);
router.get('/tutors/:id/edit', tutors.editForm);
router.post('/tutors/:id', tutors.rules, tutors.update);
router.post('/tutors/:id/approve', tutors.approve);
router.post('/tutors/:id/suspend', tutors.suspend);
router.post('/tutors/:id/reactivate', tutors.reactivate);
router.post('/tutors/:id/promote', tutors.promote);
router.post('/tutors/:id/demote', tutors.demote);
router.post('/tutors/:id/invite', tutors.resendInvite);
router.get('/tutors/:id/delete', tutors.confirmDelete);
router.post('/tutors/:id/delete', tutors.destroy);

// Visitors' requests for tutor access: review, approve (creates the account and emails the invitation), decline, delete
router.get('/tutor-requests', tutorRequests.list);
router.get('/tutor-requests/:id', tutorRequests.show);
router.get('/tutor-requests/:id/approve', tutorRequests.confirmApprove);
router.post('/tutor-requests/:id/approve', tutorRequests.approve);
router.post('/tutor-requests/:id/decline', tutorRequests.decline);
router.get('/tutor-requests/:id/delete', tutorRequests.confirmDelete);
router.post('/tutor-requests/:id/delete', tutorRequests.destroy);

// Team, activities, documents, albums (+ photos), videos, announcements, partners
for (const resource of resources) {
  router.use(`/${resource.key}`, crudRouter(resource));
}

module.exports = router;
