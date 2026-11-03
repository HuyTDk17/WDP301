const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const paymentController = require('../controllers/paymentController');

// Khởi tạo giao dịch: trả về hướng dẫn chuyển khoản (số tài khoản, mã QR, nội
// dung) hoặc xác nhận ngay nếu số dư khuyến mãi trả đủ. Giới hạn tần suất vì
// mỗi lần gọi đều sinh một bản ghi giao dịch mới.
router.post('/checkout', protect, writeLimiter, paymentController.checkout);

// Khách bấm "Tôi đã chuyển khoản" sau khi thao tác xong trên app ngân hàng.
router.post('/:id/mark-transferred', protect, writeLimiter, paymentController.markTransferred);

router.get('/history', protect, paymentController.getPaymentHistory);
router.post('/:id/refund', protect, writeLimiter, paymentController.requestRefund);
router.get('/:bookingId/status', protect, paymentController.getPaymentStatus);

module.exports = router;
