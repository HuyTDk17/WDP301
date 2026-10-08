import { Schema, model } from 'mongoose';

const bookingSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    guestName: { type: String, default: '' },
    guestPhone: { type: String, default: '' },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    courtId: { type: Schema.Types.ObjectId, ref: 'Court', required: true },
    venueName: { type: String, required: true },
    courtName: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String, required: true }, // HH:mm
    duration: { type: Number, required: true },
    sport: { type: String, default: '' },
    notes: { type: String, default: '' },
    amount: { type: Number, required: true },
    serviceFee: { type: Number, default: 0 },
    ownerCommission: { type: Number, default: 0 },
    commissionRate: { type: Number, default: 10 },
    promoCode: { type: String, default: '' },
    discountAmount: { type: Number, default: 0 },
    creditApplied: { type: Number, default: 0 },
    status: {
      type: String,
      enum: [
        'awaiting_payment',
        'confirmed',
        'completed',
        'cancelled',
        'no_show',
      ],
      default: 'awaiting_payment',
    },
    paymentMethod: { type: String, default: 'bank_transfer' },
    cancellationReason: { type: String, default: '' },
    refundAmount: { type: Number, default: 0 },
    refundCreditAmount: { type: Number, default: 0 },
    cancellationFee: { type: Number, default: 0 },

    // Field Transfer (Cross-Owner)
    transferredToBookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
    transferredFromBookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
    rootBookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
    transferCount: { type: Number, default: 0 },
    compensationAmount: { type: Number, default: 0 },
    transferFeeAmount: { type: Number, default: 0 },
    originalPaidAmount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

bookingSchema.index({ customerId: 1 });
bookingSchema.index({ venueId: 1, date: 1 });
bookingSchema.index({ courtId: 1, date: 1 });
bookingSchema.index({ status: 1 });

export const Booking = model('Booking', bookingSchema, 'bookings');
