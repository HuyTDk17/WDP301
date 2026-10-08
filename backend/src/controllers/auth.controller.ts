import { Request, Response } from 'express';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { loginSchema, registerSchema } from '../validations/auth.validation';
import { parseRequest } from '../utils/parse';
import * as authService from '../services/auth.service';

export const register = catchAsync(async (req: Request, res: Response) => {
  const input = parseRequest(registerSchema, req.body);
  const data = await authService.register(input);
  res.status(201).json({ success: true, data });
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const input = parseRequest(loginSchema, req.body);
  const data = await authService.login(input);
  res.json({ success: true, data });
});

export const me = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, 'Vui lòng đăng nhập');
  }
  res.json({ success: true, data: { user: req.user } });
});
  
export const profile = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, 'Vui lòng đăng nhập');
  }
  const data = await authService.getProfile(req.user.id);
  res.json({ success: true, data });
});
