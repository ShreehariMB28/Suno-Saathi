const express = require('express');
const { syncUser, getCurrentUser, setUsername } = require('../controllers/userController');

const router = express.Router();

router.post('/sync', syncUser);
router.patch('/username', setUsername);
router.get('/me', getCurrentUser);

module.exports = router;
