const express = require('express');
const pub = require('../controllers/publicController');
const notifications = require('../controllers/notificationsController');
const documents = require('../controllers/documentsController');
const { provideCsrfToken } = require('../middleware/security');
const { contactLimiter } = require('../middleware/rateLimits');
const authRoutes = require('./auth');
const tutorRoutes = require('./tutor');
const adminRoutes = require('./admin');

const router = express.Router();

// Public site
router.get('/', pub.home);
router.get('/about', pub.about);
router.get('/team', pub.team);
router.get('/announcements', notifications.page);
router.get('/curriculum', pub.curriculum);
router.get('/activities/:slug', pub.activity);
router.get('/gallery', pub.gallery);
router.get('/gallery/:slug', pub.album);
router.get('/contact', provideCsrfToken, pub.showContact);
router.post('/contact', contactLimiter, provideCsrfToken, pub.contactRules, pub.submitContact);

router.get('/documents/:id/download', documents.download);

router.use('/', authRoutes);
router.use('/tutor', tutorRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
