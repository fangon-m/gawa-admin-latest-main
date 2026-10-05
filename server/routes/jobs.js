const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/jobs');
const checkInCtrl = require('../controllers/jobCheckIns');
const escalatedCtrl = require('../controllers/escalatedJobs');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.listJobs);
router.get('/escalated', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), escalatedCtrl.listEscalatedJobs);
router.get('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.getJobById);
router.post('/:id/flag', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), ctrl.flagJob);
router.post('/:id/remove', authenticate, authorize(ROLES.ADMIN), ctrl.removeJob);
router.post('/:id/resolve', authenticate, authorize(ROLES.ADMIN), escalatedCtrl.resolveEscalatedJob);
router.post('/check-in/:matchId', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), checkInCtrl.checkIn);
router.get('/check-in-status/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), checkInCtrl.getCheckInStatus);

module.exports = router;
