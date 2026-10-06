const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const favoriteController = require('../controllers/favoriteController');

// Yêu thích là chức năng của khách hàng — chủ sân/admin không dùng.
router.use(protect, authorize('customer'));

router.get('/', favoriteController.getFavorites);
router.post('/', favoriteController.addFavorite);
router.delete('/:venueId', favoriteController.removeFavorite);

module.exports = router;
