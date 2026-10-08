const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const documentController = require('../controllers/documentController');

// Bắt buộc đăng nhập — quyền hạn cụ thể (admin hoặc đúng chủ hồ sơ) được kiểm
// tra bên trong documentController.getOwnerDocument.
router.get('/:filename', protect, documentController.getOwnerDocument);

module.exports = router;
