const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ctrl = require('../controllers/auth');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

// Accepting an invite is unauthenticated and touches the auth admin API, so it
// gets its own tight budget on top of the /api/auth limiter in server.js.
const acceptInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

router.post('/login', validate(schemas.login), ctrl.login);
router.post('/accept-invite', acceptInviteLimiter, validate(schemas.acceptInvite), ctrl.acceptInvite);
router.post('/request-reset', validate(schemas.requestReset), ctrl.requestPasswordReset);
router.post('/reset-password', validate(schemas.resetPassword), ctrl.resetPassword);
// The admin portal serves team members only: a consumer account must not be
// able to change a portal password or query portal identity.
router.post('/change-password', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validate(schemas.changePassword), ctrl.changePassword);
router.post('/logout', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.logout);
router.post('/refresh', ctrl.refreshToken);
router.get('/me', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.me);

module.exports = router;
