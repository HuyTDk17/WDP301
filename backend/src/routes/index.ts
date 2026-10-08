import { Router } from 'express';
import authRoutes from './auth.routes';
import venueRoutes from './venue.routes';
import bookingRoutes from './booking.routes';
import slotHoldRoutes from './slotHold.routes';
import interactionRoutes from './interaction.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/venues', venueRoutes);
router.use('/bookings', bookingRoutes);
router.use('/slot-holds', slotHoldRoutes);
router.use('/', interactionRoutes);

export default router;
