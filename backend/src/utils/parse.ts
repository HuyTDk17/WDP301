import { z } from 'zod';
import ApiError from './ApiError';

/**
 * Parse dữ liệu đầu vào bằng Zod schema. Trả về lỗi 400 kèm chi tiết từng field.
 */
export const parseRequest = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ApiError(400, 'Dữ liệu không hợp lệ', details);
  }
  return result.data;
};
