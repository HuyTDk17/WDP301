const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const transferController = require('../controllers/transferController');

// Chuyển sân là nghiệp vụ của KHÁCH HÀNG. Chủ sân có luồng duyệt riêng ở
// /api/owner/transfers, quản trị viên ở /api/admin/transfers.
router.get('/my', protect, authorize('customer'), transferController.getMine);
router.post('/:id/confirm', protect, authorize('customer'), transferController.confirm);
router.post('/:id/cancel', protect, authorize('customer'), transferController.cancel);
// Cả ba vai trò đều xem được chi tiết (đã kiểm tra quyền bên trong controller)
router.get('/:id', protect, transferController.getById);

module.exports = router;
