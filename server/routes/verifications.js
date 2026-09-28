const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/verifications');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

router.get('/', authenticate, ctrl.listVerifications);
router.get('/:id', authenticate, ctrl.getVerificationById);
router.post('/:id/approve', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validate(schemas.reviewVerification), ctrl.approveVerification);
router.post('/:id/reject', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validate(schemas.rejectVerification), ctrl.rejectVerification);

module.exports = router;
