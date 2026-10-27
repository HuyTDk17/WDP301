const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const bookingController = require('../controllers/bookingController');
const transferController = require('../controllers/transferController');
const invoiceController = require('../controllers/invoiceController');

// Các route này là nghiệp vụ đặt sân của KHÁCH HÀNG — chủ sân/admin có luồng
// riêng ở ownerRoutes.js (/owner/bookings) và adminRoutes.js (/admin/bookings).
// Khi một tài khoản trở thành "owner", họ không được dùng lại các chức năng của
// khách hàng bình thường (đặt sân, xem lịch sử đặt sân...).
router.use(protect, authorize('customer'));

// `writeLimiter` được đặt sau `protect` để nó đếm theo TÀI KHOẢN thay vì theo
// IP — nhiều người dùng chung một mạng (quán cà phê, ký túc xá, 4G NAT) không
// nên chặn lẫn nhau. Các thao tác dưới đây đều tạo ra tài nguyên hoặc chạm vào
// tiền, nên nếu không giới hạn thì một script đơn giản có thể tạo hàng nghìn
// lượt giữ chỗ và khoá sạch lịch của mọi sân.
router.post('/hold', writeLimiter, bookingController.holdSlot);
router.post('/', writeLimiter, bookingController.createBooking);

router.get('/my', bookingController.getMyBookings);
router.get('/stats', bookingController.getBookingStats);
router.get('/:id', bookingController.getBookingById);
router.get('/:id/cancel-preview', bookingController.previewCancellation);
// Hóa đơn cho lượt đặt đã xác nhận / hoàn tất (khách xem, in hoặc lưu PDF từ trình duyệt)
router.get('/:id/invoice', invoiceController.getInvoice);
router.patch('/:id/cancel', writeLimiter, bookingController.cancelBooking);

// ── Chuyển sân ──
// Hai bước đầu gắn với ĐƠN GỐC; các bước sau gắn với YÊU CẦU CHUYỂN và nằm ở
// routes/transferRoutes.js.
router.get('/:id/transfer/eligibility', transferController.getEligibility);
router.get('/:id/transfer/suggestions', transferController.getSuggestions);
router.post('/:id/transfer/quote', writeLimiter, transferController.createQuote);

module.exports = router;
