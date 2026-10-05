const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reviews');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listReviews);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getReviewById);

module.exports = router;