import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/authenticate';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);
router.get('/profile', requireAuth, authController.profile);

export default router;
