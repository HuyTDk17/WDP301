const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const uploadContentImage = require('../middleware/uploadContentImage');
const { writeLimiter } = require('../middleware/rateLimiter');

const venueController = require('../controllers/venueController');
const courtController = require('../controllers/courtController');
const bookingController = require('../controllers/bookingController');
const statsController = require('../controllers/statsController');
const settlementController = require('../controllers/settlementController');
const transferController = require('../controllers/transferController');
const paymentController = require('../controllers/paymentController');
const eventController = require('../controllers/eventController');
const networkController = require('../controllers/networkController');
const cancellationPolicyController = require('../controllers/cancellationPolicyController');

router.use(protect, authorize('owner'));

// Venues
router.get('/venues', venueController.getOwnerVenues);
router.post('/venues', upload.array('images', 8), venueController.createVenue);
router.put('/venues/:id', upload.array('images', 8), venueController.updateVenue);
router.delete('/venues/:id', venueController.deleteVenue);
router.patch('/venues/:id/status', venueController.toggleVenueStatus);

// Courts
router.get('/courts', courtController.getOwnerCourts);
router.post('/venues/:venueId/courts', courtController.createCourt);
router.put('/venues/:venueId/courts/:courtId', courtController.updateCourt);
router.patch('/venues/:venueId/courts/:courtId/status', courtController.updateCourtStatus);
router.delete('/venues/:venueId/courts/:courtId', courtController.deleteCourt);

// Bookings
router.get('/bookings', bookingController.getOwnerBookings);
router.post('/bookings/manual', bookingController.createManualBooking);
router.patch('/bookings/:id/status', bookingController.updateBookingStatus);

// Hoàn tiền cho khách — tiền nằm ở chủ sân nên chủ sân là người chuyển khoản trả lại
router.get('/refunds', paymentController.getOwnerRefunds);
router.patch('/refunds/:id/refunded', writeLimiter, paymentController.ownerMarkRefunded);

// Chuyển khoản đặt sân — khách chuyển THẲNG vào tài khoản của chủ sân, nên chủ
// sân là người đối chiếu sao kê và xác nhận/từ chối. Mỗi chủ sân chỉ thấy và xử
// lý được giao dịch có tài khoản nhận tiền là của chính mình.
router.get('/payments/pending-bank', paymentController.getOwnerPendingBankPayments);
router.post('/payments/:id/confirm-bank-transfer', writeLimiter, paymentController.ownerConfirmBankTransfer);
router.post('/payments/:id/reject-bank-transfer', writeLimiter, paymentController.ownerRejectBankTransfer);

// Chuyển sân — chủ sân duyệt các yêu cầu CHUYỂN ĐẾN địa điểm của mình
router.get('/transfers', transferController.getOwnerTransfers);
router.post('/transfers/:id/approve', transferController.approve);
router.post('/transfers/:id/reject', transferController.reject);
router.patch('/venues/:id/transfer-policy', transferController.setVenueTransferPolicy);

// Chính sách hủy riêng của chủ sân (biểu hoàn tiền theo giờ báo trước, phải đạt sàn của nền tảng)
router.get('/cancellation-policy', cancellationPolicyController.getPolicy);
router.put('/cancellation-policy', writeLimiter, cancellationPolicyController.updatePolicy);

// Mạng lưới chuyển sân: xem trạng thái thành viên và xin tham gia
router.get('/network', networkController.getMyNetwork);
router.post('/network/request', writeLimiter, networkController.requestToJoin);

// Sự kiện (giải đấu / khuyến mãi) tại địa điểm của chủ sân: tạo, sửa, hủy
router.get('/events', eventController.getOwnerEvents);
router.post('/events', writeLimiter, uploadContentImage.single('image'), eventController.createEvent);
router.put('/events/:id', writeLimiter, uploadContentImage.single('image'), eventController.updateEvent);
router.post('/events/:id/cancel', writeLimiter, eventController.cancelEvent);

// Đánh giá của khách trên các địa điểm của chủ sân: xem, trả lời, xóa phản hồi
router.get('/reviews', venueController.getOwnerReviews);
router.post('/reviews/:id/reply', writeLimiter, venueController.replyToReview);
router.delete('/reviews/:id/reply', writeLimiter, venueController.deleteReviewReply);

// Stats & Revenue
router.get('/stats', statsController.getOwnerStats);
router.get('/revenue', statsController.getOwnerRevenue);
// Phí dịch vụ nền tảng: khách chuyển thẳng cho chủ sân nên chủ sân nộp phí theo hoá đơn hằng tháng
router.get('/commission', settlementController.getMyCommission);
router.get('/commission/orders', settlementController.getMyFeeOrders);
router.post('/commission/:id/report', writeLimiter, settlementController.reportPaid);

module.exports = router;
