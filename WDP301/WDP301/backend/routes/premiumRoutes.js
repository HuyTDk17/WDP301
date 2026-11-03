const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const c = require('../controllers/premiumController');

router.get('/plans', optionalAuth, c.getPlans);
router.get('/me', protect, c.getMine);
router.post('/orders', protect, writeLimiter, c.createOrder);
router.post('/orders/:id/report', protect, writeLimiter, c.reportPaid);
router.post('/orders/:id/cancel', protect, writeLimiter, c.cancelOrder);

module.exports = router;
