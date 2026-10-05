const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rentals');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listRentals);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getRentalById);
router.post('/:id/flag', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.flagRental);
router.post('/:id/remove', authenticate, authorize(ROLES.ADMIN), ctrl.removeRental);

module.exports = router;