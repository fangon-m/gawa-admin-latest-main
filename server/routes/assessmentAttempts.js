const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assessmentAttempts');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

// Submit an assessment attempt (with retake gating) — authenticated but open to any logged-in user
router.post('/submit', authenticate, ctrl.submitAttempt);

// Get active overrides for a user
router.get('/:userId/overrides', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getActiveOverrides);

// Grant a retake exception override (admin only)
router.post('/:userId/grant-override', authenticate, authorize(ROLES.ADMIN), ctrl.grantRetakeOverride);

// Get attempt history for a user on a specific assessment
router.get('/:userId/:assessmentId', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getAttemptHistory);

// Get attempt history for a user across all assessments
router.get('/:userId', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getUserAllAttempts);

module.exports = router;
