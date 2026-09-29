const express = require('express');
const { listContacts, addContact, removeContact } = require('../controllers/emergencyContactController');

const router = express.Router();
router.get('/', listContacts);
router.post('/', addContact);
router.delete('/:id', removeContact);

module.exports = router;
