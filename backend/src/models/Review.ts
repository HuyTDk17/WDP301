import { Schema, model } from 'mongoose';

const reviewSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    helpful: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

reviewSchema.index({ venueId: 1 });

export const Review = model('Review', reviewSchema, 'reviews');
