import { Schema, model } from 'mongoose';

/**
 * Khoá khung giờ (chống double-booking).
 * slotIndex = số slot 30 phút tính từ 00:00 (17:00 → 34, 18:30 → 37).
 *
 * Có 2 loại khoá:
 *  - Khoá của booking: có `bookingId`, không có `expiresAt` → tồn tại tới khi huỷ booking.
 *  - Khoá giữ chỗ tạm (hold): có `holdId` + `expiresAt` → tự hết hạn. Dùng khi một
 *    yêu cầu (ví dụ chuyển sân) đang được xử lý và cần giữ slot đích không cho người khác đặt.
 */
const slotLockSchema = new Schema(
  {
    courtId: { type: Schema.Types.ObjectId, ref: 'Court', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    slotIndex: { type: Number, required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },

    // Giữ chỗ tạm
    holdId: { type: Schema.Types.ObjectId, default: null },
    heldBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    purpose: { type: String, enum: ['booking', 'transfer'], default: 'booking' },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

slotLockSchema.index({ courtId: 1, date: 1, slotIndex: 1 }, { unique: true });
slotLockSchema.index({ bookingId: 1 });
slotLockSchema.index({ holdId: 1 });
// MongoDB tự xoá khoá giữ chỗ khi quá `expiresAt` (khoá của booking có expiresAt = null nên không bị xoá).
slotLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SlotLock = model('SlotLock', slotLockSchema, 'slotlocks');
