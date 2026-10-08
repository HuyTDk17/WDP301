import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ');

export const venueIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const createReviewSchema = z.object({
  venueId: objectIdSchema,
  rating: z.number().int().min(1, 'Điểm tối thiểu là 1').max(5, 'Điểm tối đa là 5'),
  comment: z.string().trim().max(1000).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const createFavoriteSchema = z.object({
  venueId: objectIdSchema,
});

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.preprocess(
    (v) => (v === 'true' || v === true),
    z.boolean().optional()
  ),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const markNotificationsReadSchema = z.object({
  ids: z.array(objectIdSchema).max(100).optional(),
  all: z.boolean().optional(),
});
