const mongoose = require('mongoose');

/**
 * Bài tin tức / thông báo của nền tảng. Nội dung là VĂN BẢN THUẦN (đoạn cách nhau bằng dòng trống),
 * không nhận HTML — frontend hiển thị bằng text nên không có nguy cơ XSS từ nội dung bài viết.
 */
const newsSchema = new mongoose.Schema(
    {
        title: { type: String, required: [true, 'Vui lòng nhập tiêu đề bài viết'], trim: true, maxlength: 150 },
        // Đường dẫn cố định, tạo một lần khi tạo bài (đổi tiêu đề sau đó không làm hỏng link đã chia sẻ).
        slug: { type: String, required: true, unique: true, index: true },
        summary: { type: String, default: '', trim: true, maxlength: 300 },
        content: { type: String, required: [true, 'Vui lòng nhập nội dung bài viết'], maxlength: 20000 },
        coverImage: { type: String, default: '' },
        status: { type: String, enum: ['draft', 'published'], default: 'draft' },
        publishedAt: { type: Date, default: null },
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);
newsSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model('News', newsSchema);
