const express = require('express');
const { listAlerts, markAlertRead } = require('../controllers/emergencyAlertController');

const router = express.Router();
router.get('/', listAlerts);
router.patch('/:id/read', markAlertRead);

module.exports = router;
