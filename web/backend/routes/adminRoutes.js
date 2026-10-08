const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

const userController = require('../controllers/userController');
const bookingController = require('../controllers/bookingController');
const statsController = require('../controllers/statsController');
const venueController = require('../controllers/venueController');
const settingsController = require('../controllers/settingsController');
const settlementController = require('../controllers/settlementController');

router.use(protect, authorize('admin'));

// Users & Owners
router.get('/users', userController.getUsers);
router.get('/users/stats', statsController.getUserStats);
router.get('/users/:id', userController.getUserById);
router.patch('/users/:id/status', userController.updateUserStatus);
router.delete('/users/:id', userController.deleteUser);
router.get('/owners', userController.getOwners);
router.get('/owners/:id', userController.getOwnerDetail);
router.patch('/owners/:id/confirm-bank-info', userController.confirmBankInfo);
// Đối soát hoa hồng với chủ sân (khách chuyển thẳng cho chủ sân nên nền tảng thu hoa hồng qua hoá đơn)
router.get('/owners/:id/settlements', settlementController.getOwnerSettlementsAdmin);
router.post('/owners/:id/settlements', settlementController.issueForOwner);
router.get('/settlements/balances', settlementController.getBalances);
router.get('/settlements', settlementController.listSettlements);
router.post('/settlements/:id/confirm', settlementController.confirmSettlement);
router.post('/settlements/:id/reject', settlementController.rejectSettlement);
router.post('/settlements/:id/cancel', settlementController.cancelSettlement);

// Venues (quản lý toàn bộ địa điểm trên nền tảng)
router.get('/venues/stats', venueController.getVenueStatsAdmin);
router.get('/venues', venueController.getAllVenuesAdmin);
router.post('/venues/:id/warn', venueController.warnVenueOwner);
router.delete('/venues/:id', venueController.adminDeleteVenue);
router.patch('/venues/:id/status', venueController.adminToggleVenueStatus);

// Reviews (kiểm duyệt đánh giá)
router.get('/reviews', venueController.getAllReviewsAdmin);
router.delete('/reviews/:id', venueController.adminDeleteReview);

// Hoa hồng nền tảng thu được trên từng lượt đặt (CHỈ ĐỌC). Quản trị viên không
// tham gia luồng đặt sân / thanh toán / hoàn tiền / chuyển sân giữa khách và chủ
// sân — chỉ theo dõi hoa hồng và đối soát với chủ sân (settlements ở trên).
router.get('/commissions', bookingController.getCommissionReport);

// Stats & Revenue
router.get('/stats', statsController.getAdminStats);
router.get('/revenue', statsController.getAdminRevenue);

// Cài đặt nền tảng (tên, email hỗ trợ, % hoa hồng)
router.get('/settings', settingsController.getPlatformSettings);
router.put('/settings', settingsController.updatePlatformSettings);

module.exports = router;
