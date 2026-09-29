const express = require('express');

const { analyzeController } = require('../controllers/analyzeController');
const uploadMiddleware = require('../middleware/uploadMiddleware');

const router = express.Router();

router.post('/', uploadMiddleware.single('audio'), analyzeController);

module.exports = router;