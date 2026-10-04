const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/skills');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listSkills);
router.get('/:id', authenticate, ctrl.getSkillById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createSkill);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateSkill);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteSkill);
router.get('/skill-assessments', authenticate, ctrl.listSkillAssessments);

module.exports = router;