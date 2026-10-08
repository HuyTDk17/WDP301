import { Request, Response } from 'express';
import catchAsync from '../utils/catchAsync';
import { parseRequest } from '../utils/parse';
import {
  courtAvailabilityQuerySchema,
  courtIdParamsSchema,
  listCourtsQuerySchema,
  listVenuesQuerySchema,
  venueIdParamsSchema,
} from '../validations/venue.validation';
import * as venueService from '../services/venue.service';

export const listVenues = catchAsync(async (req: Request, res: Response) => {
  const query = parseRequest(listVenuesQuerySchema, req.query);
  const data = await venueService.listVenues(query);
  res.json({ success: true, data });
});

export const getVenue = catchAsync(async (req: Request, res: Response) => {
  const { id } = parseRequest(venueIdParamsSchema, req.params);
  const data = await venueService.getVenue(id);
  res.json({ success: true, data });
});

export const listCourts = catchAsync(async (req: Request, res: Response) => {
  const { id } = parseRequest(venueIdParamsSchema, req.params);
  const query = parseRequest(listCourtsQuerySchema, req.query);
  const data = await venueService.listCourts(id, query);
  res.json({ success: true, data });
});

export const courtAvailability = catchAsync(async (req: Request, res: Response) => {
  const { id } = parseRequest(venueIdParamsSchema, req.params);
  const { courtId } = parseRequest(courtIdParamsSchema, req.params);
  const { date } = parseRequest(courtAvailabilityQuerySchema, req.query);
  const data = await venueService.courtAvailability(id, courtId, date);
  res.json({ success: true, data });
});
