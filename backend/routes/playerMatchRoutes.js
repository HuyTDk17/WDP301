const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const playerMatchController = require('../controllers/playerMatchController');

router.use(protect, authorize('customer'));
router.get('/', playerMatchController.listMatches);
router.post('/', writeLimiter, playerMatchController.createMatch);
router.post('/:id/join', writeLimiter, playerMatchController.joinMatch);

module.exports = router;