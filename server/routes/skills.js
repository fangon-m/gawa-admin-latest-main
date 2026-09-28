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

router.get('/entity/:entityType/:entityId', authenticate, ctrl.listEntitySkills);
router.post('/entity/:entityType/:entityId', authenticate, authorize(ROLES.ADMIN), ctrl.assignEntitySkill);
router.delete('/entity/:entityType/:entityId/:skillId', authenticate, authorize(ROLES.ADMIN), ctrl.removeEntitySkill);

module.exports = router;
