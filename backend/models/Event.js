const mongoose = require('mongoose');

/**
 * Sự kiện do CHỦ SÂN tạo tại địa điểm của mình để thu hút khách: giải đấu, chương trình khuyến mãi, hoạt động khác.
 * Chỉ mang tính thông tin/quảng bá — hệ thống KHÔNG nhận đăng ký tham gia hay thu tiền sự kiện.
 *
 * Trạng thái lưu: 'scheduled' | 'cancelled'. "Sắp diễn ra / đang diễn ra / đã kết thúc" là TRẠNG THÁI SUY RA
 * từ startsAt/endsAt so với giờ hiện tại (xem eventController.phaseOf), nên không cần job cập nhật định kỳ.
 */
const eventSchema = new mongoose.Schema(
    {
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
        // Lưu tên tại thời điểm tạo để danh sách của chủ sân vẫn đọc được dù địa điểm bị đổi tên.
        venueName: { type: String, default: '' },
        title: { type: String, required: [true, 'Vui lòng nhập tên sự kiện'], trim: true, maxlength: 120 },
        type: { type: String, enum: ['tournament', 'promotion', 'other'], default: 'other' },
        description: { type: String, required: [true, 'Vui lòng nhập mô tả sự kiện'], trim: true, maxlength: 3000 },
        // Dòng nổi bật ngắn hiển thị trên thẻ, ví dụ "Giảm 20% giờ vàng".
        highlight: { type: String, default: '', trim: true, maxlength: 60 },
        // Phí tham gia (VND) chỉ để thông tin, 0 = miễn phí.
        price: { type: Number, default: 0, min: 0, max: 100000000 },
        imageUrl: { type: String, default: '' },
        startsAt: { type: Date, required: true },
        endsAt: { type: Date, required: true },
        status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
        cancelReason: { type: String, default: '', maxlength: 500 },
        cancelledAt: { type: Date, default: null },
    },
    { timestamps: true }
);
eventSchema.index({ status: 1, endsAt: 1 });
eventSchema.index({ ownerId: 1, startsAt: -1 });
eventSchema.index({ venueId: 1, startsAt: 1 });

module.exports = mongoose.model('Event', eventSchema);
