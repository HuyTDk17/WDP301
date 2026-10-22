const mongoose = require('mongoose');

/**
 * Bài "tìm thêm người chơi" của chủ một lượt đặt sân đã xác nhận.
 * Môn, sân, giờ lấy từ lượt đặt tại thời điểm đăng (sao chép để danh sách đọc nhanh, không cần join).
 *
 * source: 'booking' = đăng từ một lượt đặt đã xác nhận (có bookingId, tự đóng khi lượt đặt bị hủy/chuyển);
 *         'direct'  = đăng thẳng ở trang Tìm người chơi (chưa gắn lượt đặt, không có bookingId — nhóm tự đặt sân).
 *
 * status: open (còn chỗ) | full (đã đủ người) | closed (chủ nhóm đóng, hoặc lượt đặt bị hủy/chuyển).
 * `active` = bài còn hiệu lực (open/full) — dùng cho chỉ mục duy nhất một phần: mỗi lượt đặt chỉ có MỘT bài đang mở.
 * Hết hạn không cần job: bài có startsAt đã qua sẽ không còn được liệt kê hay nhận yêu cầu.
 */
const playerPostSchema = new mongoose.Schema(
    {
        hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },   // chỉ có với bài source='booking'
        source: { type: String, enum: ['booking', 'direct'], default: 'booking' },
        courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court' },
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
        venueName: { type: String, default: '' },
        courtName: { type: String, default: '' },
        sport: { type: String, default: '' },
        date: { type: String, required: true },          // YYYY-MM-DD
        startTime: { type: String, required: true },     // HH:MM
        endTime: { type: String, required: true },
        startsAt: { type: Date, required: true },        // giờ bắt đầu (UTC) để lọc/hết hạn
        slotsNeeded: { type: Number, required: true, min: 1, max: 20 },
        acceptedCount: { type: Number, default: 0, min: 0 },
        level: { type: String, enum: ['any', 'beginner', 'intermediate', 'advanced'], default: 'any' },
        note: { type: String, default: '', trim: true, maxlength: 300 },
        status: { type: String, enum: ['open', 'full', 'closed'], default: 'open' },
        closedReason: { type: String, default: '' },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
);
playerPostSchema.index({ status: 1, startsAt: 1 });
playerPostSchema.index({ hostId: 1, startsAt: -1 });
// Bài 'direct' không có bookingId: phải loại khỏi chỉ mục duy nhất, nếu không mọi bài thiếu bookingId đều bị tính là trùng nhau (null).
// Với CSDL đã chạy bản cũ, chỉ mục cũ cùng tên được dựng lại bằng PlayerPost.ensureIndexes() (xem scripts/migrate.js + server.js).
playerPostSchema.index({ bookingId: 1 }, { unique: true, partialFilterExpression: { active: true, bookingId: { $type: 'objectId' } } });

/**
 * Chỉ mục cũ `bookingId_1` có partialFilterExpression { active: true } — vẫn chặn nhiều bài 'direct' (cùng bookingId = null).
 * Hàm này gỡ chỉ mục cũ rồi dựng bản mới. Idempotent, lỗi "namespace chưa tồn tại" (CSDL trống) được bỏ qua.
 */
playerPostSchema.statics.ensureIndexes = async function ensurePlayerPostIndexes() {
    try {
        const existing = await this.collection.indexes();
        const old = existing.find((i) => i.name === 'bookingId_1');
        const hasType = old && JSON.stringify(old.partialFilterExpression || {}).includes('$type');
        if (old && !hasType) await this.collection.dropIndex('bookingId_1');
    } catch (err) {
        if (err.codeName !== 'NamespaceNotFound' && err.code !== 26) throw err;
    }
    await this.createIndexes();
};

module.exports = mongoose.model('PlayerPost', playerPostSchema);
