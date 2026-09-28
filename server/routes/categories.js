const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/categories');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', ctrl.listCategories);
router.get('/:id', ctrl.getCategoryById);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createCategory);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateCategory);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteCategory);

module.exports = router;
