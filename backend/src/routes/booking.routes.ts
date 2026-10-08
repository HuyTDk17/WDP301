import { Router } from 'express';
import * as bookingController from '../controllers/booking.controller';
import { requireAuth } from '../middlewares/authenticate';

const router = Router();

router.use(requireAuth);

router.post('/', bookingController.createBooking);
router.get('/', bookingController.listMyBookings);
router.get('/:id', bookingController.getMyBooking);
router.get('/:id/cancellation-quote', bookingController.getCancellationQuote);
router.post('/:id/cancel', bookingController.cancelBooking);

export default router;
