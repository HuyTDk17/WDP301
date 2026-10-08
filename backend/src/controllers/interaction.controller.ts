import { Request, Response } from 'express';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { parseRequest } from '../utils/parse';
import {
  createFavoriteSchema,
  createReviewSchema,
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
  venueIdParamsSchema,
} from '../validations/common.validation';
import * as interactionService from '../services/interaction.service';

const requireUserId = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, 'Vui lòng đăng nhập');
  }
  return req.user.id;
};

// ─── Đánh giá ──────────────────────────────────────────────────────────────

export const createReview = catchAsync(async (req: Request, res: Response) => {
  const input = parseRequest(createReviewSchema, req.body);
  const data = await interactionService.createReview(requireUserId(req), input);
  res.status(201).json({ success: true, data });
});

export const listReviews = catchAsync(async (req: Request, res: Response) => {
  const { id } = parseRequest(venueIdParamsSchema, req.params);
  const data = await interactionService.listReviews(id);
  res.json({ success: true, data });
});

// ─── Yêu thích ─────────────────────────────────────────────────────────────

export const addFavorite = catchAsync(async (req: Request, res: Response) => {
  const { venueId } = parseRequest(createFavoriteSchema, req.body);
  const data = await interactionService.addFavorite(requireUserId(req), venueId);
  res.status(201).json({ success: true, data });
});

export const removeFavorite = catchAsync(async (req: Request, res: Response) => {
  const { id } = parseRequest(venueIdParamsSchema, req.params);
  const data = await interactionService.removeFavorite(requireUserId(req), id);
  res.json({ success: true, data });
});

export const listFavorites = catchAsync(async (req: Request, res: Response) => {
  const data = await interactionService.listFavorites(requireUserId(req));
  res.json({ success: true, data });
});

// ─── Thông báo ─────────────────────────────────────────────────────────────

export const listNotifications = catchAsync(async (req: Request, res: Response) => {
  const query = parseRequest(listNotificationsQuerySchema, req.query);
  const data = await interactionService.listNotifications(requireUserId(req), !!query.unreadOnly);
  res.json({ success: true, data });
});

export const markNotificationsRead = catchAsync(async (req: Request, res: Response) => {
  const input = parseRequest(markNotificationsReadSchema, req.body);
  const data = await interactionService.markNotificationsRead(requireUserId(req), input.ids, input.all);
  res.json({ success: true, data });
});
