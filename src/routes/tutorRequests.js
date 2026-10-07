const express = require('express');
const tutorRequests = require('../controllers/tutorRequestController');
const { provideCsrfToken } = require('../middleware/security');
const { tutorRequestLimiter } = require('../middleware/rateLimits');

const router = express.Router();

// Public: a visitor asks for a tutor account. Creates no account; an administrator reviews each request.
router.get('/request-tutor-access', provideCsrfToken, tutorRequests.showForm);
router.post('/request-tutor-access', tutorRequestLimiter, provideCsrfToken, tutorRequests.rules, tutorRequests.submit);

module.exports = router;
