import { NextFunction, Request, Response, RequestHandler } from 'express';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { loadAuthenticatedUser } from '../services/session.service';

const getBearerToken = (req: Request): string => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, 'Vui lòng đăng nhập');
  }
  return header.slice('Bearer '.length).trim();
};

export const requireAuth = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    req.user = await loadAuthenticatedUser(getBearerToken(req));
    next();
  }
);

export const requireRoles = (...roles: string[]): RequestHandler => {
  return (req, _res, next) => {
    if (!req.user) {
      next(new ApiError(401, 'Vui lòng đăng nhập'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ApiError(403, 'Bạn không có quyền thực hiện thao tác này'));
      return;
    }

    next();
  };
};
