const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const playerController = require('../controllers/playerController');

// Tìm người chơi chung — chỉ dành cho KHÁCH HÀNG đã đăng nhập.
router.use(protect, authorize('customer'));

router.get('/', playerController.listPosts);
router.post('/', writeLimiter, playerController.createPost);
router.get('/mine', playerController.getMyPosts);
router.get('/requests/mine', playerController.getMyRequests);
router.post('/requests/:requestId/respond', writeLimiter, playerController.respondToRequest);
router.post('/requests/:requestId/withdraw', writeLimiter, playerController.withdrawRequest);
router.post('/:id/join', writeLimiter, playerController.joinPost);
router.post('/:id/close', writeLimiter, playerController.closeMyPost);

module.exports = router;
