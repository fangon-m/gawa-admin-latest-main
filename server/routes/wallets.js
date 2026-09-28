const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wallets');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listWallets);
router.get('/user/:userId', authenticate, ctrl.getWalletByUserId);
router.get('/:id', authenticate, ctrl.getWalletById);
router.post('/:id/adjust', authenticate, authorize(ROLES.ADMIN), ctrl.adjustBalance);

module.exports = router;
