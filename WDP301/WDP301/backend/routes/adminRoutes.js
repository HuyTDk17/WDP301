const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');

const userController = require('../controllers/userController');
const bookingController = require('../controllers/bookingController');
const statsController = require('../controllers/statsController');
const venueController = require('../controllers/venueController');
const settingsController = require('../controllers/settingsController');
const settlementController = require('../controllers/settlementController');
const complaintController = require('../controllers/complaintController');
const contentController = require('../controllers/contentController');
const networkController = require('../controllers/networkController');
const sportCategoryController = require('../controllers/sportCategoryController');
const uploadContentImage = require('../middleware/uploadContentImage');

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

// Đổi vai trò khách hàng ↔ chủ sân (bắt buộc nhập lý do)
router.patch('/users/:id/role', writeLimiter, userController.changeUserRole);

// Quản lý nội dung: banner, tin tức, trang chính sách, danh mục môn thể thao
router.get('/banners', contentController.getBannersAdmin);
router.post('/banners', writeLimiter, uploadContentImage.single('image'), contentController.createBanner);
router.put('/banners/:id', writeLimiter, uploadContentImage.single('image'), contentController.updateBanner);
router.delete('/banners/:id', writeLimiter, contentController.deleteBanner);

router.get('/news', contentController.getNewsAdmin);
router.get('/news/:id', contentController.getNewsByIdAdmin);
router.post('/news', writeLimiter, uploadContentImage.single('coverImage'), contentController.createNews);
router.put('/news/:id', writeLimiter, uploadContentImage.single('coverImage'), contentController.updateNews);
router.delete('/news/:id', writeLimiter, contentController.deleteNews);

router.get('/policies', contentController.getPoliciesAdmin);
router.post('/policies', writeLimiter, contentController.createPolicy);
router.put('/policies/:id', writeLimiter, contentController.updatePolicy);
router.delete('/policies/:id', writeLimiter, contentController.deletePolicy);

router.get('/sport-categories', sportCategoryController.getCategoriesAdmin);
router.post('/sport-categories', writeLimiter, sportCategoryController.createCategory);
router.put('/sport-categories/:id', writeLimiter, sportCategoryController.updateCategory);
router.delete('/sport-categories/:id', writeLimiter, sportCategoryController.deleteCategory);

// Mạng lưới chuyển sân: duyệt / từ chối / gỡ chủ sân
router.get('/network', networkController.listOwners);
router.post('/network/approve-pending', writeLimiter, networkController.approveAllPending);
router.post('/network/:ownerId/invite', writeLimiter, networkController.inviteOwner);
router.patch('/network/:ownerId', writeLimiter, networkController.reviewOwner);

// Khiếu nại của khách hàng: xem danh sách, nhận xử lý, liên hệ khách/chủ sân, giải quyết + gửi phản hồi
router.get('/complaints', complaintController.getComplaintsAdmin);
router.get('/complaints/:id', complaintController.getComplaintAdmin);
router.patch('/complaints/:id/start', complaintController.startInvestigation);
router.post('/complaints/:id/contact', complaintController.contactParty);
router.post('/complaints/:id/resolve', complaintController.resolveComplaint);

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
