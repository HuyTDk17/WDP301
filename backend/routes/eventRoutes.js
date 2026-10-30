const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');

// Sự kiện CÔNG KHAI (không cần đăng nhập). Phần quản lý của chủ sân nằm ở ownerRoutes.js (/api/owner/events).
router.get('/', eventController.listPublicEvents);
router.get('/:id', eventController.getPublicEvent);

module.exports = router;
