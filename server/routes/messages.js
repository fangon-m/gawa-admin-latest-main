const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/messages');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listConversations);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getConversation);
router.post('/send', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validate(schemas.sendMessage), ctrl.sendMessage);
router.post('/create', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validate(schemas.createConversation), ctrl.createConversation);

module.exports = router;
