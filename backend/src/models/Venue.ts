import { Schema, model } from 'mongoose';

const addressSchema = new Schema(
  {
    street: { type: String, default: '' },
    district: { type: String, default: '' },
    city: { type: String, default: '' },
  },
  { _id: false }
);

const openHoursSchema = new Schema(
  {
    open: { type: String, default: '05:30' },
    close: { type: String, default: '23:00' },
  },
  { _id: false }
);

const venueSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    sports: { type: [String], default: [] },
    address: { type: addressSchema, default: () => ({}) },
    amenities: { type: [String], default: [] },
    images: { type: [String], default: [] },
    openHours: { type: openHoursSchema, default: () => ({}) },
    rules: { type: String, default: '' },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    isActive: { type: Boolean, default: true },
    suspendedByOwnerBan: { type: Boolean, default: false },
    transferRequiresApproval: { type: Boolean, default: false },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

venueSchema.index({ status: 1, isActive: 1 });
venueSchema.index({ 'address.city': 1, 'address.district': 1 });
venueSchema.index({ sports: 1 });

export const Venue = model('Venue', venueSchema, 'venues');
