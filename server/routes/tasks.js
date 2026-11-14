const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/tasks');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { validateUuidParam } = require('../middleware/validate');

// The router is mounted at /matches/:matchId/completions, so the match id
// arrives through mergeParams.
router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validateUuidParam('matchId'), ctrl.listCompletions);
router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validateUuidParam('matchId'), ctrl.createCompletion);
router.put('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT), validateUuidParam('matchId', 'id'), ctrl.updateCompletion);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), validateUuidParam('matchId', 'id'), ctrl.deleteCompletion);

module.exports = router;
