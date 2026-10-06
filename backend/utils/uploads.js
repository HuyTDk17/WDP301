const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

/**
 * LƯU TRỮ ẢNH CÔNG KHAI (ảnh sân, ảnh đại diện).
 *
 * Hai chế độ, chọn tự động theo biến môi trường:
 *   - Có CLOUDINARY_URL (hoặc đủ CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)
 *     → ảnh nằm trên Cloudinary, DB lưu URL https đầy đủ. Dùng cho hosting có
 *     ổ đĩa tạm (Render free...), nơi file ghi cục bộ sẽ mất sau mỗi lần restart.
 *   - Không có → ghi vào thư mục uploads/ như trước (chạy máy cá nhân, VPS).
 */

let configured = null;

function isCloudinaryConfigured() {
    if (configured === null) {
        const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
        if (CLOUDINARY_URL) {
            // Dạng cloudinary://<api_key>:<api_secret>@<cloud_name> — tự phân tích để kết quả
            // xác định, không phụ thuộc việc SDK đã nạp biến môi trường lúc nào.
            try {
                const u = new URL(CLOUDINARY_URL);
                configured = u.protocol === 'cloudinary:' && !!(u.hostname && u.username && u.password);
                if (configured) {
                    cloudinary.config({
                        cloud_name: u.hostname,
                        api_key: decodeURIComponent(u.username),
                        api_secret: decodeURIComponent(u.password),
                        secure: true,
                    });
                }
            } catch { configured = false; }
        } else if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
            cloudinary.config({
                cloud_name: CLOUDINARY_CLOUD_NAME,
                api_key: CLOUDINARY_API_KEY,
                api_secret: CLOUDINARY_API_SECRET,
                secure: true,
            });
            configured = true;
        } else {
            configured = false;
        }
    }
    return configured;
}

/** Dùng trong test để nạp lại cấu hình sau khi đổi process.env. */
function _resetConfigCache() { configured = null; }

/** URL để lưu vào DB cho một file multer vừa lưu xong. */
function fileUrl(file) {
    return file.url || `/uploads/${file.filename}`;
}

const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(?:[^/]+\/)*v\d+\/(.+)\.[A-Za-z0-9]+$/;

/** 'https://res.cloudinary.com/abc/image/upload/v1/esport360/venues/x.jpg' → 'esport360/venues/x' (chỉ với ảnh của tài khoản mình). */
function publicIdFromUrl(url) {
    if (typeof url !== 'string' || !isCloudinaryConfigured()) return null;
    const m = CLOUDINARY_URL_RE.exec(url);
    if (!m || m[1] !== cloudinary.config().cloud_name) return null;
    return m[2];
}

/**
 * Xoá một ảnh do hệ thống tự lưu (cục bộ hoặc Cloudinary). Cố gắng hết sức,
 * không bao giờ ném lỗi: ảnh mồ côi chỉ tốn chỗ chứ không làm hỏng nghiệp vụ.
 * Ảnh Google, avatar dựng sẵn hay đường dẫn lạ đều bị bỏ qua.
 */
function removeStoredFile(url) {
    const avatars = require('./avatars');
    if (avatars.isLocalUpload(url)) {
        const file = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', path.basename(url));
        fs.unlink(file, () => {});
        return;
    }
    const publicId = publicIdFromUrl(url);
    if (publicId) {
        cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })
            .catch((err) => console.error('Cloudinary destroy:', err.message || err));
    }
}

/**
 * Dọn giấy tờ riêng tư vừa tải lên nhưng hồ sơ bị từ chối ở bước kiểm tra
 * (thiếu trường, chưa xác minh email...). Multer lưu file TRƯỚC khi controller
 * chạy, nên không dọn thì mỗi lần nộp lỗi để lại một file mồ côi.
 */
function discardPrivateUploads(files) {
    for (const f of files || []) {
        if (f.path) fs.unlink(f.path, () => {});   // chế độ đĩa: multer có `path`
        else require('../models/PrivateFile').deleteOne({ filename: f.filename }).catch(() => {});
    }
}

module.exports = {
    discardPrivateUploads, cloudinary, isCloudinaryConfigured, fileUrl, publicIdFromUrl, removeStoredFile, _resetConfigCache,
};
