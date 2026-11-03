const mongoose = require('mongoose');

/**
 * File riêng tư (giấy tờ pháp lý của hồ sơ chủ sân) lưu ngay trong MongoDB.
 * Lý do: hosting miễn phí có ổ đĩa tạm (file ghi cục bộ mất sau mỗi lần
 * restart), còn dịch vụ lưu file bên ngoài thường chặn PDF hoặc để lộ URL.
 * Mỗi file ≤ 5MB (giới hạn của multer) nên nằm gọn dưới trần 16MB/document.
 * Chỉ đọc được qua controllers/documentController.js (có kiểm tra quyền).
 */
const privateFileSchema = new mongoose.Schema({
    filename: { type: String, required: true, unique: true },
    originalName: { type: String, default: '' },
    contentType: { type: String, required: true },
    size: { type: Number, default: 0 },
    data: { type: Buffer, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('PrivateFile', privateFileSchema);
