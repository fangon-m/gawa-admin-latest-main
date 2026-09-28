const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/feeConfig');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listConfigs);
router.get('/active', authenticate, ctrl.getActiveConfig);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createConfig);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateConfig);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteConfig);
router.post('/:id/set-active', authenticate, authorize(ROLES.ADMIN), ctrl.setActiveConfig);

module.exports = router;
