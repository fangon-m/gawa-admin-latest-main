const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reports');
const actionCtrl = require('../controllers/reportActions');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');
const rateLimit = require('express-rate-limit');

function requireAdminForCompliance(req, res, next) {
  if (req.params.actionId !== 'mark_compliant') return next();
  const roles = req.user?.roles?.length ? req.user.roles : [req.user?.role].filter(Boolean);
  if (!roles.includes(ROLES.ADMIN)) {
    return res.status(403).json({ error: 'ACTION_FORBIDDEN' });
  }
  next();
}

const reportActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.user.id,
  message: { error: 'RATE_LIMITED' },
});

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listReports);
router.get('/moderation/health', authenticate, authorize(ROLES.ADMIN), ctrl.getModerationStatus);
router.get('/moderation/metrics', authenticate, authorize(ROLES.ADMIN), ctrl.getModerationMetrics);
router.get('/:id/warning', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), actionCtrl.getReportWarning);
router.get('/:id/actions', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), actionCtrl.getReportActions);
router.post(
  '/:id/actions/:actionId',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT),
  requireAdminForCompliance,
  reportActionLimiter,
  validate(schemas.issueReportAction),
  actionCtrl.executeReportAction
);

module.exports = router;
