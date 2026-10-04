const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assessmentQuestions');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listAssessmentQuestions);
router.get('/:id', authenticate, ctrl.getAssessmentQuestionById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createAssessmentQuestion);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateAssessmentQuestion);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteAssessmentQuestion);

module.exports = router;