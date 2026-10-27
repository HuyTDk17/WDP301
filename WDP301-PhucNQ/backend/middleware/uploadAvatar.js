const multer = require('multer');
const path = require('path');
const { publicImageStorage } = require('./storageEngines');

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Ảnh đại diện: CHỈ ảnh (không PDF), tối đa 2MB, phần mở rộng phải khớp loại nội dung khai báo. */
const upload = multer({
    // Cloudinary nếu đã cấu hình, ngược lại ghi vào thư mục UPLOAD_DIR (xem utils/uploads.js).
    storage: publicImageStorage({
        folder: 'esport360/avatars',
        transformation: [{ width: 512, height: 512, crop: 'limit' }, { quality: 'auto' }],
        diskPrefix: 'avatar-',
    }),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED[ext] && ALLOWED[ext] === file.mimetype) return cb(null, true);
        const err = new Error('Ảnh đại diện chỉ nhận JPG, PNG hoặc WEBP');
        err.statusCode = 400;
        cb(err);
    },
    limits: { fileSize: MAX_BYTES, files: 1 },
});

module.exports = upload;
module.exports.MAX_BYTES = MAX_BYTES;
