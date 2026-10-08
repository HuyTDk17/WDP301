import { Schema, model } from 'mongoose';

const courtSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    size: { type: String, default: '' },
    surface: { type: String, default: '' },
    pricePerHour: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

courtSchema.index({ venueId: 1 });
courtSchema.index({ type: 1 });

export const Court = model('Court', courtSchema, 'courts');
