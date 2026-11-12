const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const { validate, validateUuidParam, schemas } = require('../middleware/validate');
const notesController = require('../controllers/notes');

// List notes for a user
router.get('/users/:userId', authenticate, authorize('admin', 'customer_support'), validateUuidParam('userId'), notesController.listNotes);

// Add a note to a user
router.post('/', authenticate, authorize('admin', 'customer_support'), validate(schemas.addNote), notesController.addNote);

// Delete a note
router.delete('/:id', authenticate, authorize('admin'), validateUuidParam('id'), notesController.deleteNote);

module.exports = router;
