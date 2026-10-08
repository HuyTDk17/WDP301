import { z } from 'zod';

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Giờ phải có định dạng HH:MM');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD');

export const createBookingSchema = z.object({
  courtId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID sân con không hợp lệ'),
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  notes: z.string().trim().max(500).optional(),
  // Truyền khi đã giữ chỗ trước bằng POST /slot-holds.
  holdId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID giữ chỗ không hợp lệ').optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const listBookingsQuerySchema = z.object({
  status: z.enum(['awaiting_payment', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  page: z.preprocess(
    (v) => (v === undefined || v === '' ? 1 : Number(v)),
    z.number().int().min(1)
  ),
  pageSize: z.preprocess(
    (v) => (v === undefined || v === '' ? 20 : Number(v)),
    z.number().int().min(1).max(100)
  ),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export const bookingIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID đặt sân không hợp lệ'),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(2, 'Lý do huỷ cần ít nhất 2 ký tự').max(500).optional(),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
