const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const notesCtrl = require('../controllers/entityNotes');

// List notes for an entity
router.get('/:entityType/:entityId', authenticate, authorize('admin', 'customer_support'), notesCtrl.listNotes);

// Add a note to an entity
router.post('/:entityType/:entityId', authenticate, authorize('admin', 'customer_support'), notesCtrl.addNote);

// Delete a note from an entity
router.delete('/:entityType/:entityId/:noteId', authenticate, authorize('admin'), notesCtrl.deleteNote);

module.exports = router;
