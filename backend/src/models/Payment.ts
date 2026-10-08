import { Schema, model } from 'mongoose';

const receiverSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    bankName: { type: String, default: '' },
    bankBin: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountName: { type: String, default: '' },
  },
  { _id: false }
);

const paymentSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    transferId: { type: Schema.Types.ObjectId, default: null },
    purpose: { type: String, enum: ['booking', 'cancellation_refund', 'transfer'], default: 'booking' },
    method: { type: String, default: 'bank_transfer' },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['awaiting_confirmation', 'completed', 'refund_requested', 'refunded'],
      default: 'awaiting_confirmation',
    },
    orderRef: { type: String, default: '' },
    transactionRef: { type: String, default: '' },
    gatewayResponse: { type: Schema.Types.Mixed, default: null },
    refundReason: { type: String, default: '' },
    gatewayFee: { type: Number, default: 0 },
    creditApplied: { type: Number, default: 0 },
    receiver: { type: receiverSchema, default: null },
    refundOwnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    customerMarkedPaidAt: { type: Date, default: null },
    bankConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    bankConfirmedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

paymentSchema.index({ bookingId: 1 });
paymentSchema.index({ status: 1 });

export const Payment = model('Payment', paymentSchema, 'payments');
