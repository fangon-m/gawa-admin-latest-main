const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/transactions');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { resolveEntityParam } = require('../middleware/resolveEntity');
const { resolveEntityQuery } = require('../middleware/resolveEntityQuery');

router.get('/', authenticate, authorize(ROLES.ADMIN), resolveEntityQuery(['userId', 'user']), ctrl.listTransactions);
router.get('/:id', authenticate, authorize(ROLES.ADMIN), resolveEntityParam('transaction'), ctrl.getTransactionById);
router.post('/:id/release-escrow', authenticate, authorize(ROLES.ADMIN), resolveEntityParam('transaction'), ctrl.releaseEscrow);
router.post('/:id/refund', authenticate, authorize(ROLES.ADMIN), resolveEntityParam('transaction'), ctrl.processRefund);
router.post('/:id/approve-payout', authenticate, authorize(ROLES.ADMIN), resolveEntityParam('transaction'), ctrl.approvePayout);

module.exports = router;
