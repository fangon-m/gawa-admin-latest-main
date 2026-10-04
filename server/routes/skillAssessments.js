const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/skillAssessments');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listSkillAssessments);
router.get('/:id', authenticate, ctrl.getSkillAssessmentById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createSkillAssessment);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateSkillAssessment);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteSkillAssessment);

module.exports = router;