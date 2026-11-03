const mongoose = require('mongoose');

/**
 * Danh mục môn thể thao do Admin quản lý. `key` là mã lưu trong Venue.sports / Court.type nên KHÔNG đổi sau khi tạo.
 * Tắt (isActive=false) = không cho chọn khi tạo sân/lọc mới nhưng dữ liệu cũ vẫn hiển thị đúng tên.
 */
const sportCategorySchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z][a-z0-9-]{1,29}$/, 'Mã môn chỉ gồm chữ thường, số, dấu gạch ngang (2–30 ký tự, bắt đầu bằng chữ)'] },
        name: { type: String, required: [true, 'Vui lòng nhập tên môn'], trim: true, minlength: 2, maxlength: 40 },
        icon: { type: String, default: '🏅', trim: true, maxlength: 8 },
        color: { type: String, default: '#0A84FF', match: [/^#[0-9a-fA-F]{6}$/, 'Màu phải có dạng #RRGGBB'] },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('SportCategory', sportCategorySchema);
