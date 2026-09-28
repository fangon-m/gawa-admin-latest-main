const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/flags');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listFlags);
router.get('/counts', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getFlaggedContentCounts);
router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.createFlag);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.removeFlag);

module.exports = router;
