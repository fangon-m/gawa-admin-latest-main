const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userIncidents');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listUserIncidents);
router.post('/:id/status', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.updateUserIncident);
router.get('/export', authenticate, authorize(ROLES.ADMIN), ctrl.exportUserIncidents);

module.exports = router;
