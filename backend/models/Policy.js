const mongoose = require('mongoose');

/**
 * Trang chính sách do Admin soạn (điều khoản, bảo mật, chính sách hủy...). Cùng cấu trúc với trang tĩnh
 * mặc định ở frontend (tiêu đề + đoạn mở đầu + các mục). Chưa có bản ghi nào thì frontend dùng nội dung mặc định.
 */
const sectionSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 150 },
        body: { type: String, required: true, trim: true, maxlength: 5000 },
    },
    { _id: false }
);

const policySchema = new mongoose.Schema(
    {
        // Mã trang — dùng trong đường dẫn /policies/:key; 'privacy' và 'terms' khớp trang bảo mật/điều khoản sẵn có.
        key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9][a-z0-9-]{1,39}$/, 'Mã trang chỉ gồm chữ thường, số, dấu gạch ngang (2–40 ký tự)'] },
        title: { type: String, required: [true, 'Vui lòng nhập tiêu đề'], trim: true, maxlength: 150 },
        intro: { type: String, default: '', trim: true, maxlength: 1000 },
        sections: { type: [sectionSchema], default: [], validate: [(v) => v.length <= 30, 'Tối đa 30 mục'] },
        isPublished: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Policy', policySchema);
