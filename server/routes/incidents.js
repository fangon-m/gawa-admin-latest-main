const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/incidents');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN), ctrl.listIncidents);
router.get('/export', authenticate, authorize(ROLES.ADMIN), ctrl.exportIncidents);

module.exports = router;
