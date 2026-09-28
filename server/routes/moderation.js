const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/moderation');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listFlaggedContent);
router.post('/:id/moderate', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.moderateContent);

module.exports = router;
