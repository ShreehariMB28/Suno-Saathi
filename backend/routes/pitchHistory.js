const express = require('express');
const { createPitchHistory, listPitchHistory } = require('../controllers/pitchHistoryController');

const router = express.Router();
router.post('/', createPitchHistory);
router.get('/', listPitchHistory);

module.exports = router;
