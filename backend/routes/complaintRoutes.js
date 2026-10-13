const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const uploadEvidence = require('../middleware/uploadEvidence');
const complaintController = require('../controllers/complaintController');

// Khiếu nại do KHÁCH HÀNG gửi. Phía quản trị viên xử lý nằm ở adminRoutes.js (/admin/complaints).
router.use(protect, authorize('customer'));

router.post('/', writeLimiter, uploadEvidence.array('evidence', uploadEvidence.MAX_FILES), complaintController.createComplaint);
router.get('/my', complaintController.getMyComplaints);
router.get('/:id', complaintController.getMyComplaintById);

module.exports = router;
