const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/messages');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.get('/', authenticate, ctrl.listConversations);
router.get('/:id', authenticate, ctrl.getConversation);
router.post('/send', authenticate, validate(schemas.sendMessage), ctrl.sendMessage);
router.post('/create', authenticate, validate(schemas.createConversation), ctrl.createConversation);

module.exports = router;
