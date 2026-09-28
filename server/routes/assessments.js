const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assessments');
const attemptCtrl = require('../controllers/assessmentAttempts');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listAssessments);
router.get('/:id', authenticate, ctrl.getAssessmentById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createAssessment);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateAssessment);
router.get('/:id/responses', authenticate, ctrl.getResponsesByAssessment);
router.post('/:id/responses', authenticate, ctrl.addResponse);

// Assessment retake enforcement (matching the spec endpoints)
router.post('/:id/submit', authenticate, attemptCtrl.submitAttempt);
router.get('/:id/attempts/:userId', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), attemptCtrl.getAttemptHistory);

module.exports = router;
