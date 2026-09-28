const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settings');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listSettings);
router.get('/:key', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getSetting);
router.put('/:key', authenticate, authorize(ROLES.ADMIN), ctrl.upsertSetting);

module.exports = router;
