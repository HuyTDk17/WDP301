import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Giờ phải có định dạng HH:MM');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD');

export const createSlotHoldSchema = z.object({
  courtId: objectId,
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  purpose: z.enum(['booking', 'transfer']).default('booking'),
  // Không truyền → dùng `quoteTtlMinutes` trong cấu hình nền tảng.
  ttlMinutes: z.number().int().min(1).max(60).optional(),
});

export type CreateSlotHoldInput = z.infer<typeof createSlotHoldSchema>;

export const slotHoldIdParamsSchema = z.object({
  holdId: objectId,
});
