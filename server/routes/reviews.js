const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reviews');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listReviews);
router.get('/:id', authenticate, ctrl.getReviewById);
router.post('/:id/moderate', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.moderateReview);

module.exports = router;
