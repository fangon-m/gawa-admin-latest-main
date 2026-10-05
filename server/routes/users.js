const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/users');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

// Escalation workflow — MUST be before /:id routes to avoid param collision
router.get('/escalation/list', authenticate, authorize(ROLES.ADMIN), ctrl.listEscalatedUsers);

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listUsers);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getUserById);
router.get('/:id/proposals', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listUserProposals);
router.post('/invite', authenticate, authorize(ROLES.ADMIN), validate(schemas.inviteUser), ctrl.inviteUser);
router.patch('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateUser);
router.post('/:id/suspend', authenticate, authorize(ROLES.ADMIN), ctrl.suspendUser);
router.post('/:id/reinstate', authenticate, authorize(ROLES.ADMIN), ctrl.reinstateUser);
router.post('/:id/archive', authenticate, authorize(ROLES.ADMIN), validate(schemas.archiveUser), ctrl.archiveUser);
router.post('/:id/unarchive', authenticate, authorize(ROLES.ADMIN), ctrl.unarchiveUser);
router.post('/:id/flag', authenticate, authorize(ROLES.ADMIN), ctrl.flagUser);
router.post('/:id/reset-password', authenticate, authorize(ROLES.ADMIN), validate(schemas.adminResetPassword), ctrl.adminResetPassword);
router.post('/:id/escalate', authenticate, authorize(ROLES.ADMIN), ctrl.escalateToDeletion);
router.post('/:id/remove-from-escalation', authenticate, authorize(ROLES.ADMIN), ctrl.removeFromEscalation);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteUser);

module.exports = router;
