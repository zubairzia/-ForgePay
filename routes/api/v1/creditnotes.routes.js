const express = require('express');
const router = express.Router();
const creditNotesController = require('../../../controllers/creditnotes.controller');

router.get('/', creditNotesController.getCreditNotes);
router.post('/', creditNotesController.createCreditNote);
router.get('/:id', creditNotesController.getCreditNoteById);
router.put('/:id', creditNotesController.updateCreditNote);
router.patch('/:id/status', creditNotesController.updateCreditNoteStatus);

module.exports = router;
