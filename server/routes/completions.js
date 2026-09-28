const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/completions');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.post('/matches/:matchId/mark-done', authenticate, ctrl.markDone);
router.post('/matches/:matchId/confirm', authenticate, ctrl.confirmCompletion);
router.post('/matches/:matchId/dispute', authenticate, ctrl.disputeCompletion);

router.get('/disputed', authenticate, authorize(ROLES.ADMIN), ctrl.listDisputed);
router.post('/matches/:matchId/resolve', authenticate, authorize(ROLES.ADMIN), ctrl.resolveDispute);
router.post('/admin/process-expired', authenticate, authorize(ROLES.ADMIN), ctrl.processExpiredReviews);

module.exports = router;
