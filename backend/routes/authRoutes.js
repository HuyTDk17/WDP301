const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const uploadAvatar = require('../middleware/uploadAvatar');
const uploadPrivate = require('../middleware/uploadPrivate');
const { authLimiter, forgotPasswordLimiter, writeLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/google', authLimiter, authController.googleAuth);
router.get('/me', protect, authController.getMe);
router.post('/become-owner', protect, authController.becomeOwner);
router.post('/owner-application', protect, authLimiter, uploadPrivate.array('documents', 5), authController.submitOwnerApplication);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password/:token', forgotPasswordLimiter, authController.resetPassword);
router.post('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', protect, forgotPasswordLimiter, authController.resendVerificationEmail);
router.put('/profile', protect, authController.updateProfile);
router.put('/change-password', protect, authLimiter, authController.changePassword);
router.post('/avatar', protect, writeLimiter, uploadAvatar.single('avatar'), authController.uploadAvatar);
router.put('/avatar', protect, writeLimiter, authController.setAvatar);

module.exports = router;
