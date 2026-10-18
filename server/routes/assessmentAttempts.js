const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assessmentAttempts');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

// Actual submitted attempt counts and pass rates, grouped by skill.
router.get('/stats/skills', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getSkillAttemptStats);
router.get('/skills/:skillId', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getSkillAttempts);

// Attempt history for a user on a specific assessment
router.get('/:userId/:assessmentId', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getAttemptHistory);

// Attempt history for a user across all assessments
router.get('/:userId', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getUserAllAttempts);

module.exports = router;
