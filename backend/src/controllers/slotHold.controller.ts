import { Request, Response } from 'express';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { parseRequest } from '../utils/parse';
import { createSlotHoldSchema, slotHoldIdParamsSchema } from '../validations/slotHold.validation';
import * as slotHoldService from '../services/slotHold.service';

const requireUserId = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, 'Vui lòng đăng nhập');
  }
  return req.user.id;
};

export const createHold = catchAsync(async (req: Request, res: Response) => {
  const input = parseRequest(createSlotHoldSchema, req.body);
  const data = await slotHoldService.createHold(requireUserId(req), input);
  res.status(201).json({ success: true, data });
});

export const getHold = catchAsync(async (req: Request, res: Response) => {
  const { holdId } = parseRequest(slotHoldIdParamsSchema, req.params);
  const data = await slotHoldService.getHold(requireUserId(req), holdId);
  res.json({ success: true, data });
});

export const releaseHold = catchAsync(async (req: Request, res: Response) => {
  const { holdId } = parseRequest(slotHoldIdParamsSchema, req.params);
  const data = await slotHoldService.releaseHold(requireUserId(req), holdId);
  res.json({ success: true, data });
});
