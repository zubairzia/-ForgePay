const express = require('express');
const router = express.Router();
const creditNotesController = require('../../../controllers/creditnotes.controller');
const { requireRole } = require('../../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, MANAGE_BACK_OFFICE } = require('../../../middleware/roleGroups');

router.get('/', requireRole(...VIEW_BACK_OFFICE), creditNotesController.getCreditNotes);
router.post('/', requireRole(...MANAGE_BACK_OFFICE), creditNotesController.createCreditNote);
router.get('/:id', requireRole(...VIEW_BACK_OFFICE), creditNotesController.getCreditNoteById);
router.put('/:id', requireRole(...MANAGE_BACK_OFFICE), creditNotesController.updateCreditNote);
router.patch('/:id/status', requireRole(...MANAGE_BACK_OFFICE), creditNotesController.updateCreditNoteStatus);

module.exports = router;
