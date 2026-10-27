const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ctrl = require('../controllers/users');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

// Invitation emails are the most expensive and most abusable action on this
// router (deliverability, provider quota, inbox spam). The per-actor daily
// quota lives in the controller because it must survive restarts.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.invites.rateLimitPerIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invitation requests, please try again later' },
});

// Temporary passwords are keyed per target account so one admin cannot cycle a
// member's credentials (or spam their inbox) across many IPs.
const tempPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: config.tempPassword.maxPerHour,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.params.id,
  message: { error: 'Too many temporary passwords issued for this account. Try again in an hour.' },
});

// Three-segment paths, so they cannot be shadowed by the /:id routes below.
router.post('/invites/:inviteId/resend', authenticate, authorize(ROLES.ADMIN), inviteLimiter, ctrl.resendInvite);
router.post('/invites/:inviteId/revoke', authenticate, authorize(ROLES.ADMIN), ctrl.revokeInvite);

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listUsers);
router.get('/team', authenticate, authorize(ROLES.ADMIN), ctrl.listTeamMembers);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getUserById);
router.get('/:id/proposals', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listUserProposals);
router.post('/invite', authenticate, authorize(ROLES.ADMIN), inviteLimiter, validate(schemas.inviteUser), ctrl.inviteUser);
router.patch('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateUser);
router.post('/:id/suspend', authenticate, authorize(ROLES.ADMIN), ctrl.suspendUser);
router.post('/:id/reinstate', authenticate, authorize(ROLES.ADMIN), ctrl.reinstateUser);
router.post('/:id/archive', authenticate, authorize(ROLES.ADMIN), validate(schemas.archiveUser), ctrl.archiveUser);
router.post('/:id/unarchive', authenticate, authorize(ROLES.ADMIN), ctrl.unarchiveUser);
router.post('/:id/flag', authenticate, authorize(ROLES.ADMIN), ctrl.flagUser);
router.post('/:id/reset-password', authenticate, authorize(ROLES.ADMIN), tempPasswordLimiter, ctrl.adminResetPassword);
router.post('/:id/send-password-reset', authenticate, authorize(ROLES.ADMIN), ctrl.sendPasswordResetEmail);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteUser);

module.exports = router;
