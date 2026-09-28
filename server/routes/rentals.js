const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rentals');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, ctrl.listRentals);
router.get('/:id', authenticate, ctrl.getRentalById);
router.post('/:id/release-deposit', authenticate, authorize(ROLES.ADMIN), ctrl.releaseDeposit);
router.post('/:id/deduct-deposit', authenticate, authorize(ROLES.ADMIN), ctrl.deductDeposit);
router.post('/:id/receive', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.receiveEquipment);
router.post('/:id/return', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.returnEquipment);

module.exports = router;
