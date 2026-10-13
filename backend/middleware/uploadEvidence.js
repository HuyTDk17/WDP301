const multer = require('multer');
const path = require('path');
const { publicImageStorage } = require('./storageEngines');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/**
 * Ảnh bằng chứng đính kèm khiếu nại (ảnh chụp sân, biên lai, tin nhắn...).
 * CHỈ nhận ảnh JPG/PNG/WEBP, tối đa 5 ảnh, mỗi ảnh ≤ 5MB, phần mở rộng phải
 * khớp loại nội dung khai báo. Lưu trên Cloudinary nếu có cấu hình, ngược lại
 * ghi vào UPLOAD_DIR (xem utils/uploads.js).
 */
const upload = multer({
    storage: publicImageStorage({
        folder: 'esport360/complaints',
        transformation: [{ width: 1600, height: 1600, crop: 'limit' }, { quality: 'auto' }],
        diskPrefix: 'complaint-',
    }),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED[ext] && ALLOWED[ext] === file.mimetype) return cb(null, true);
        const err = new Error('Ảnh bằng chứng chỉ nhận JPG, PNG hoặc WEBP');
        err.statusCode = 400;
        cb(err);
    },
    limits: { fileSize: MAX_BYTES, files: MAX_FILES },
});

module.exports = upload;
module.exports.MAX_BYTES = MAX_BYTES;
module.exports.MAX_FILES = MAX_FILES;
