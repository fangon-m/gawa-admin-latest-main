const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/trustLedger');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/summary', authenticate, authorize(ROLES.ADMIN), ctrl.getSummary);
router.get('/', authenticate, authorize(ROLES.ADMIN), ctrl.listEntries);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createEntry);
router.post('/:id/release', authenticate, authorize(ROLES.ADMIN), ctrl.releaseHeldFunds);
router.post('/backfill', authenticate, authorize(ROLES.ADMIN), ctrl.backfillTrustLedger);

module.exports = router;
