import { Request, Response } from 'express';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { parseRequest } from '../utils/parse';
import {
  bookingIdParamsSchema,
  cancelBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
} from '../validations/booking.validation';
import * as bookingService from '../services/booking.service';

const requireUserId = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, 'Vui lòng đăng nhập');
  }
  return req.user.id;
};

export const createBooking = catchAsync(async (req: Request, res: Response) => {
  const input = parseRequest(createBookingSchema, req.body);
  const data = await bookingService.createBooking(requireUserId(req), input);
  res.status(201).json({ success: true, data });
});

export const listMyBookings = catchAsync(async (req: Request, res: Response) => {
  const query = parseRequest(listBookingsQuerySchema, req.query);
  const data = await bookingService.listMyBookings(requireUserId(req), query);
  res.json({ success: true, data });
});

export const getMyBooking = catchAsync(async (req: Request, res: Response) => {
  const { id } = parseRequest(bookingIdParamsSchema, req.params);
  const data = await bookingService.getMyBooking(requireUserId(req), id);
  res.json({ success: true, data });
});

export const getCancellationQuote = catchAsync(async (req: Request, res: Response) => {
  const { id } = parseRequest(bookingIdParamsSchema, req.params);
  const data = await bookingService.getCancellationQuote(requireUserId(req), id);
  res.json({ success: true, data });
});

export const cancelBooking = catchAsync(async (req: Request, res: Response) => {
  const { id } = parseRequest(bookingIdParamsSchema, req.params);
  const input = parseRequest(cancelBookingSchema, req.body);
  const data = await bookingService.cancelBooking(requireUserId(req), id, input.reason);
  res.json({ success: true, data });
});
