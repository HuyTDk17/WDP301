import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { MongooseError } from 'mongoose';
import env from '../config/env';
import ApiError from '../utils/ApiError';

export const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  next(new ApiError(404, `Không tìm thấy: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode = 500;
  let message = 'Lỗi máy chủ nội bộ';
  let details: unknown = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof MongooseError && err.name === 'CastError') {
    statusCode = 400;
    message = 'Định dạng ID không hợp lệ';
  } else if (err instanceof Error && err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Dữ liệu không hợp lệ';
  }

  if (env.nodeEnv === 'production' && statusCode === 500) {
    message = 'Lỗi máy chủ nội bộ';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(env.nodeEnv === 'development' && statusCode === 500 ? { stack: err.stack } : {}),
  });
};
