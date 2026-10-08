import { Schema, model } from 'mongoose';

const favoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

favoriteSchema.index({ userId: 1, venueId: 1 }, { unique: true });

export const Favorite = model('Favorite', favoriteSchema, 'favorites');
