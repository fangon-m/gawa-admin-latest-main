const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/roles');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listRoles);
router.get('/user-roles', authenticate, ctrl.listUserRoles);
router.get('/:id', authenticate, ctrl.getRoleById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createRole);
router.post('/assign', authenticate, authorize(ROLES.ADMIN), ctrl.assignUserRole);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateRole);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteRole);
router.delete('/user-roles/:id', authenticate, authorize(ROLES.ADMIN), ctrl.removeUserRole);

module.exports = router;
