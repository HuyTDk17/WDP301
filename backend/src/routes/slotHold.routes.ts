import { Router } from 'express';
import * as slotHoldController from '../controllers/slotHold.controller';
import { requireAuth } from '../middlewares/authenticate';

const router = Router();

router.use(requireAuth);

router.post('/', slotHoldController.createHold);
router.get('/:holdId', slotHoldController.getHold);
router.delete('/:holdId', slotHoldController.releaseHold);

export default router;
