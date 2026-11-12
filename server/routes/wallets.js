const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wallets');
const { authenticate } = require('../middleware/auth');
const { resolveEntityQuery } = require('../middleware/resolveEntityQuery');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), resolveEntityQuery(['userId', 'user']), ctrl.listWallets);
router.get('/user/:userId', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getWalletByUserId);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getWalletById);
router.post('/:id/adjust', authenticate, authorize(ROLES.ADMIN), ctrl.adjustBalance);

module.exports = router;
