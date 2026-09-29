const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reviews');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, ctrl.listReviews);
router.get('/:id', authenticate, ctrl.getReviewById);

module.exports = router;