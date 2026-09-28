const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/tasks');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listCompletions);
router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.createCompletion);
router.put('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.updateCompletion);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteCompletion);

module.exports = router;
