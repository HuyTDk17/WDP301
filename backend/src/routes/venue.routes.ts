import { Router } from 'express';
import * as venueController from '../controllers/venue.controller';

const router = Router();

// Công khai (không cần đăng nhập): xem danh sách / chi tiết sân.
router.get('/', venueController.listVenues);
router.get('/:id', venueController.getVenue);
router.get('/:id/courts', venueController.listCourts);
router.get('/:id/courts/:courtId/availability', venueController.courtAvailability);

export default router;
