const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reports');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listReports);
router.post('/:id/moderate', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.moderateReport);

module.exports = router;
