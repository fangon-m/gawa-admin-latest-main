const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notifications');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listNotifications);
router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validate(schemas.createNotification), ctrl.createNotification);
router.patch('/:id/read', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.markAsRead);
router.post('/read-all', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.markAllRead);

module.exports = router;
