const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/messages');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listConversations);
// Declared before `/:id`, otherwise "recipients" is parsed as a conversation id.
router.get('/recipients', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listRecipients);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getConversation);
router.post('/send', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validate(schemas.sendMessage), ctrl.sendMessage);

module.exports = router;
