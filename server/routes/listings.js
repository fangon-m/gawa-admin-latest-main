const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/listings');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listListings);
router.get('/:id', authenticate, ctrl.getListingById);
router.post('/:id/flag', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.flagListing);
router.post('/:id/remove', authenticate, authorize(ROLES.ADMIN), ctrl.removeListing);

module.exports = router;
