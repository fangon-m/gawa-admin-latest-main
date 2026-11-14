const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/activityLog');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, validateQuery, schemas } = require('../middleware/validate');

router.get(
  '/',
  authenticate,
  authorize(ROLES.ADMIN),
  validateQuery(schemas.listActivityLog),
  ctrl.listActivityLog
);

router.post(
  '/',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(schemas.createActivityLog),
  ctrl.createActivityLog
);

module.exports = router;
