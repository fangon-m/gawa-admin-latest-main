const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/questions');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', ctrl.listQuestions);
router.get('/:id', ctrl.getQuestionById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createQuestion);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateQuestion);
router.post('/:id/delete', authenticate, authorize(ROLES.ADMIN), ctrl.deleteQuestion);

// Keep backward compatibility: DELETE method also works
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteQuestion);

module.exports = router;
