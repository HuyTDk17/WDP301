const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const sportCategoryController = require('../controllers/sportCategoryController');

// Nội dung CÔNG KHAI (không cần đăng nhập): banner trang chủ, tin tức, trang chính sách, danh mục môn.
// Phần quản trị của các mục này nằm ở adminRoutes.js (/api/admin/...).
router.get('/banners', contentController.getPublicBanners);
router.get('/news', contentController.getPublicNews);
router.get('/news/:slug', contentController.getPublicNewsBySlug);
router.get('/policies', contentController.getPublicPolicies);
router.get('/policies/:key', contentController.getPublicPolicy);
router.get('/sports', sportCategoryController.getPublicSports);

module.exports = router;
