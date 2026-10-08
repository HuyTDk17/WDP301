import { z } from 'zod';

const optionalPrice = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : Number(v)),
  z.number().int('Giá phải là số nguyên').min(0, 'Giá không được âm').optional()
);

export const listVenuesQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    sport: z.string().trim().max(30).optional(),
    city: z.string().trim().max(60).optional(),
    district: z.string().trim().max(60).optional(),
    // Lọc theo giá thuê mỗi giờ của sân con.
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
    // Lọc sân còn trống: phải truyền đủ cả date + startTime + endTime.
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD').optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Giờ phải có định dạng HH:MM').optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Giờ phải có định dạng HH:MM').optional(),
    page: z.preprocess(
      (v) => (v === undefined || v === '' ? 1 : Number(v)),
      z.number().int().min(1)
    ),
    pageSize: z.preprocess(
      (v) => (v === undefined || v === '' ? 20 : Number(v)),
      z.number().int().min(1).max(100)
    ),
  })
  .superRefine((value, ctx) => {
    const timeParts = [value.date, value.startTime, value.endTime].filter(Boolean).length;
    if (timeParts > 0 && timeParts < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['date'],
        message: 'Lọc giờ trống cần đủ ngày, giờ bắt đầu và giờ kết thúc',
      });
    }
    if (value.startTime && value.endTime && value.endTime <= value.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Giờ kết thúc phải sau giờ bắt đầu' });
    }
    if (value.minPrice !== undefined && value.maxPrice !== undefined && value.maxPrice < value.minPrice) {
      ctx.addIssue({ code: 'custom', path: ['maxPrice'], message: 'Giá tối đa phải lớn hơn giá tối thiểu' });
    }
  });

export type ListVenuesQuery = z.infer<typeof listVenuesQuerySchema>;

export const venueIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ'),
});

export const courtIdParamsSchema = z.object({
  courtId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ'),
});

export const listCourtsQuerySchema = z.object({
  type: z.string().trim().max(30).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD').optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Giờ phải có định dạng HH:MM').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Giờ phải có định dạng HH:MM').optional(),
});

export type ListCourtsQuery = z.infer<typeof listCourtsQuerySchema>;

export const courtAvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD'),
});
