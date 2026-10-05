const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/disputes');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listDisputes);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getDisputeById);
router.post('/:id/status', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validate(schemas.updateDisputeStatus), ctrl.updateDisputeStatus);

module.exports = router;
