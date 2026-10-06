const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const venueController = require('../controllers/venueController');

router.get('/featured', venueController.getFeaturedVenues);
router.get('/:id/slots', venueController.getAvailableSlots);
router.get('/:id/reviews', venueController.getVenueReviews);
router.post('/:id/reviews', protect, venueController.addReview);
router.get('/:id', optionalAuth, venueController.getVenueById);
router.get('/', venueController.getVenues);

module.exports = router;
