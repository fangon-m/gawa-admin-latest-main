const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/gawaPoints');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/packs', authenticate, ctrl.listPacks);
router.post('/packs', authenticate, authorize(ROLES.ADMIN), ctrl.createPack);
router.put('/packs/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updatePack);
router.delete('/packs/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deletePack);
router.post('/issue', authenticate, authorize(ROLES.ADMIN), ctrl.issuePoints);
router.post('/deduct', authenticate, authorize(ROLES.ADMIN), ctrl.deductPoints);
router.get('/transactions', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listPointsTransactions);
router.get('/wallets', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listWallets);
router.post('/wallets/:userId/adjust', authenticate, authorize(ROLES.ADMIN), ctrl.adjustWallet);

module.exports = router;