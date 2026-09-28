const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/appeals');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listAppeals);
router.get('/:id', authenticate, ctrl.getAppealById);
router.post('/:id/forward', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.forwardAppeal);
router.post('/:id/decide', authenticate, authorize(ROLES.ADMIN), ctrl.decideAppeal);

module.exports = router;
