const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/skills');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listSkills);
// Registered before `/:id` so the literal path is not swallowed by the param route.
router.get('/skill-assessments', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listSkillAssessments);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getSkillById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createSkill);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateSkill);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteSkill);

module.exports = router;