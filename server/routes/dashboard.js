const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboard');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/stats', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getStats);

module.exports = router;
