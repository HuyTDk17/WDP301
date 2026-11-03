const multer = require('multer');
const path = require('path');
const { publicImageStorage } = require('./storageEngines');

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Ảnh nội dung do Admin tải lên (banner, ảnh bìa tin tức): một ảnh JPG/PNG/WEBP ≤ 5MB, đuôi file phải khớp loại nội dung. */
const upload = multer({
    storage: publicImageStorage({
        folder: 'esport360/content',
        transformation: [{ width: 2000, height: 2000, crop: 'limit' }, { quality: 'auto' }],
        diskPrefix: 'content-',
    }),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED[ext] && ALLOWED[ext] === file.mimetype) return cb(null, true);
        const err = new Error('Ảnh chỉ nhận JPG, PNG hoặc WEBP');
        err.statusCode = 400;
        cb(err);
    },
    limits: { fileSize: MAX_BYTES, files: 1 },
});

module.exports = upload;
