const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assessmentsTests');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listTests);
router.get('/:id', authenticate, ctrl.getTestById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createTest);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateTest);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteTest);

module.exports = router;
