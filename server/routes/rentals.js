const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rentals');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { resolveEntityParam } = require('../middleware/resolveEntity');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listRentals);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), resolveEntityParam('rental'), ctrl.getRentalById);
router.post('/:id/flag', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), resolveEntityParam('rental'), ctrl.flagRental);
router.post('/:id/remove', authenticate, authorize(ROLES.ADMIN), resolveEntityParam('rental'), ctrl.removeRental);

module.exports = router;