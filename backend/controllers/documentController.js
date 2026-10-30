const path = require('path');
const fs = require('fs');
const asyncHandler = require('../utils/asyncHandler');
const uploadPrivate = require('../middleware/uploadPrivate');
const PrivateFile = require('../models/PrivateFile');

/**
 * @route   GET /api/owner-documents/:filename
 * Phục vụ giấy tờ pháp lý của hồ sơ đăng ký chủ sân (được middleware
 * `protect` ở route bắt buộc đăng nhập). Chỉ hai nhóm được xem:
 *   - admin (xét duyệt hồ sơ)
 *   - chính chủ tài khoản đã nộp giấy tờ đó
 * TRƯỚC ĐÂY các file này nằm trong `uploads/` công khai, ai có link cũng tải
 * được, không cần đăng nhập.
 */
exports.getOwnerDocument = asyncHandler(async (req, res) => {
    const { filename } = req.params;

    // Chặn path traversal (vd. "..%2f..%2fserver.js") trước khi chạm tới filesystem.
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ message: 'Tên file không hợp lệ' });
    }

    const expectedUrl = `/owner-documents/${filename}`;
    const owned = req.user.role === 'admin'
        || (req.user.ownerApplicationDocuments || []).some((doc) => doc.url === expectedUrl);
    // Không phải admin và không phải chủ hồ sơ — trả 404 (không tiết lộ file
    // có tồn tại hay không) thay vì 403.
    if (!owned) return res.status(404).json({ message: 'Không tìm thấy tài liệu' });

    // Không cho trình duyệt tự suy đoán content-type rồi render như trang web
    // (vd. một file .html giả dạng .jpg) — luôn ép tải/hiển thị đúng như file gốc.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');

    // Giấy tờ mới nằm trong MongoDB (xem models/PrivateFile.js).
    const stored = await PrivateFile.findOne({ filename });
    if (stored) {
        res.setHeader('Content-Type', stored.contentType);
        return res.send(stored.data);
    }

    // Tương thích ngược: giấy tờ cũ còn nằm trên đĩa (PRIVATE_STORAGE=disk hoặc dữ liệu trước khi chuyển).
    const filePath = path.join(uploadPrivate.PRIVATE_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    res.sendFile(path.resolve(filePath));
});
