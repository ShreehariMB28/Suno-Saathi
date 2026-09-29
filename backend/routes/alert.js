const express = require('express');
const { sendAlertController } = require('../controllers/alertController');

const router = express.Router();

router.post('/send', sendAlertController);

module.exports = router;
