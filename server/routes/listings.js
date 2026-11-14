const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/listings');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { resolveEntityParam } = require('../middleware/resolveEntity');
const { resolveEntityQuery } = require('../middleware/resolveEntityQuery');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), resolveEntityQuery(['ownerId', 'user']), ctrl.listListings);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), resolveEntityParam('listing'), ctrl.getListingById);
router.post('/:id/flag', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), resolveEntityParam('listing'), ctrl.flagListing);
router.post('/:id/remove', authenticate, authorize(ROLES.ADMIN), resolveEntityParam('listing'), ctrl.removeListing);

module.exports = router;
