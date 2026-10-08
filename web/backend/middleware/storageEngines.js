const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { cloudinary, isCloudinaryConfigured } = require('../utils/uploads');

/**
 * STORAGE ENGINE cho multer.
 *
 * - CloudinaryStorage: đẩy thẳng luồng file lên Cloudinary (không đệm vào RAM
 *   hay ổ đĩa), trả về `file.url` (https) và `file.publicId`.
 * - MongoFileStorage: giữ file RIÊNG TƯ (giấy tờ pháp lý) trong collection
 *   PrivateFile của MongoDB. Không có URL công khai nào — chỉ phục vụ qua
 *   controllers/documentController.js sau khi kiểm tra quyền.
 * - diskStorage: chế độ cũ khi không cấu hình Cloudinary.
 */

const uniqueName = () => `${Date.now()}-${crypto.randomInt(1e9)}`;

class CloudinaryStorage {
    constructor({ folder, transformation }) {
        this.folder = folder;
        this.transformation = transformation;
    }

    _handleFile(req, file, cb) {
        let done = false;
        const finish = (err, info) => { if (!done) { done = true; cb(err, info); } };

        const upload = cloudinary.uploader.upload_stream(
            { folder: this.folder, resource_type: 'image', unique_filename: true, transformation: this.transformation },
            (err, result) => {
                if (err || !result) {
                    const e = new Error('Không tải được ảnh lên kho lưu trữ, vui lòng thử lại');
                    e.statusCode = 502;
                    console.error('Cloudinary upload:', (err && err.message) || err);
                    return finish(e);
                }
                finish(null, { url: result.secure_url, publicId: result.public_id, filename: result.public_id, size: result.bytes });
            },
        );
        file.stream.on('error', finish);
        file.stream.pipe(upload);
    }

    _removeFile(req, file, cb) {
        if (!file.publicId) return cb(null);
        cloudinary.uploader.destroy(file.publicId, { resource_type: 'image' }).catch(() => {}).finally(() => cb(null));
    }
}

const SAFE_TYPES = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
};

class MongoFileStorage {
    _handleFile(req, file, cb) {
        const PrivateFile = require('../models/PrivateFile');
        const chunks = [];
        file.stream.on('data', (c) => chunks.push(c));
        file.stream.on('error', cb);
        file.stream.on('end', async () => {
            try {
                const ext = path.extname(file.originalname).toLowerCase();
                const filename = `${uniqueName()}${ext}`;
                const data = Buffer.concat(chunks);
                await PrivateFile.create({
                    filename,
                    originalName: file.originalname,
                    // Loại nội dung suy từ đuôi file đã qua fileFilter, KHÔNG tin mimetype client gửi.
                    contentType: SAFE_TYPES[ext] || 'application/octet-stream',
                    size: data.length,
                    data,
                });
                cb(null, { filename, size: data.length });
            } catch (err) { cb(err); }
        });
    }

    _removeFile(req, file, cb) {
        require('../models/PrivateFile').deleteOne({ filename: file.filename }).catch(() => {}).finally(() => cb(null));
    }
}

/** Ảnh công khai: Cloudinary nếu đã cấu hình, ngược lại ghi vào thư mục uploads/. */
function publicImageStorage({ folder, transformation, diskPrefix = '' }) {
    if (isCloudinaryConfigured()) return new CloudinaryStorage({ folder, transformation });

    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    return multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${diskPrefix}${uniqueName()}${ext}`);
        },
    });
}

/** Giấy tờ riêng tư: MongoDB mặc định; PRIVATE_STORAGE=disk để dùng thư mục private-uploads/ như trước. */
function privateFileStorage(privateDir) {
    if (process.env.PRIVATE_STORAGE === 'disk') {
        if (!fs.existsSync(privateDir)) fs.mkdirSync(privateDir, { recursive: true });
        return multer.diskStorage({
            destination: (req, file, cb) => cb(null, privateDir),
            filename: (req, file, cb) => cb(null, `${uniqueName()}${path.extname(file.originalname)}`),
        });
    }
    return new MongoFileStorage();
}

module.exports = { CloudinaryStorage, MongoFileStorage, publicImageStorage, privateFileStorage };
