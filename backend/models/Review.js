const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
    {
        venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, default: '' },
        helpful: { type: Number, default: 0 },
        // Lần sửa gần nhất của khách (null = chưa từng sửa) — hiển thị "đã chỉnh sửa" để người đọc biết.
        editedAt: { type: Date, default: null },
        // Phản hồi công khai của CHỦ SÂN dưới đánh giá (mỗi đánh giá tối đa một phản hồi, chủ sân sửa/xóa được).
        reply: {
            text: { type: String, default: '', maxlength: 1000 },
            repliedAt: { type: Date, default: null },
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
