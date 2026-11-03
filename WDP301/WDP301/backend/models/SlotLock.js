const mongoose = require('mongoose');

/**
 * KHOÁ KHUNG GIỜ ở cấp cơ sở dữ liệu.
 *
 * Cách kiểm tra trùng lịch cũ theo kiểu "đọc rồi mới ghi": giữa lúc kiểm tra
 * và lúc tạo booking có một khoảng trống mà hai yêu cầu đồng thời đều lọt qua.
 * Với chuyển sân, xác suất xảy ra cao hơn hẳn vì luồng đặt sân thường và luồng
 * chuyển sân cùng tranh một khung giờ.
 *
 * Mỗi khung giờ được chẻ thành các ô 30 phút (slotIndex 0..47). Unique index
 * dưới đây khiến MongoDB TỪ CHỐI ghi ô đã có người giữ — không còn khoảng
 * trống nào để lọt. Cách này đồng thời bắt được cả trường hợp khung giờ chồng
 * lấn MỘT PHẦN (19:00-20:30 vs 20:00-21:00) mà index theo startTime bỏ sót.
 */
const slotLockSchema = new mongoose.Schema(
    {
        courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true },
        date: { type: String, required: true },
        slotIndex: { type: Number, required: true, min: 0, max: 47 },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    },
    { timestamps: true }
);

slotLockSchema.index({ courtId: 1, date: 1, slotIndex: 1 }, { unique: true });
slotLockSchema.index({ bookingId: 1 });

module.exports = mongoose.model('SlotLock', slotLockSchema);
