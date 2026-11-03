const mongoose = require('mongoose');

/** Banner trang chủ do Admin quản lý. Chỉ hiển thị khi đang bật và nằm trong khoảng [startsAt, endsAt] (nếu có). */
const bannerSchema = new mongoose.Schema(
    {
        title: { type: String, required: [true, 'Vui lòng nhập tiêu đề banner'], trim: true, maxlength: 100 },
        subtitle: { type: String, default: '', trim: true, maxlength: 200 },
        imageUrl: { type: String, required: [true, 'Vui lòng chọn ảnh banner'] },
        // Chỉ nhận đường dẫn nội bộ ("/venues") hoặc https/http — chặn "javascript:" và các lược đồ nguy hiểm.
        linkUrl: { type: String, default: '', trim: true, maxlength: 500 },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
    },
    { timestamps: true }
);
bannerSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
