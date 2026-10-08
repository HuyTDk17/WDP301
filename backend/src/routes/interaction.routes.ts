import { Router } from 'express';
import * as interactionController from '../controllers/interaction.controller';
import { requireAuth } from '../middlewares/authenticate';

const router = Router();

// Đánh giá (xem công khai, tạo cần đăng nhập).
router.get('/venues/:id/reviews', interactionController.listReviews);
router.post('/reviews', requireAuth, interactionController.createReview);

// Yêu thích (cần đăng nhập).
router.get('/favorites', requireAuth, interactionController.listFavorites);
router.post('/favorites', requireAuth, interactionController.addFavorite);
router.delete('/favorites/:id', requireAuth, interactionController.removeFavorite);

// Thông báo (cần đăng nhập).
router.get('/notifications', requireAuth, interactionController.listNotifications);
router.post('/notifications/read', requireAuth, interactionController.markNotificationsRead);

export default router;
