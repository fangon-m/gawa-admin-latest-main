const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auth');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.post('/login', validate(schemas.login), ctrl.login);
router.post('/request-reset', validate(schemas.requestReset), ctrl.requestPasswordReset);
router.post('/reset-password', validate(schemas.resetPassword), ctrl.resetPassword);
router.post('/change-password', authenticate, validate(schemas.changePassword), ctrl.changePassword);
router.post('/refresh', ctrl.refreshToken);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
