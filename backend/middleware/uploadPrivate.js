const multer = require('multer');
const path = require('path');
const { privateFileStorage } = require('./storageEngines');

/**
 * Multer RIÊNG cho giấy tờ pháp lý của hồ sơ đăng ký chủ sân (giấy chứng nhận
 * đăng ký kinh doanh, giấy phép...). KHÁC với middleware/upload.js (ảnh sân,
 * ảnh đại diện) — thư mục ở đây KHÔNG nằm trong UPLOAD_DIR nên không bị
 * `express.static` ở server.js phục vụ công khai.
 *
 * TRƯỚC ĐÂY: giấy tờ này lưu chung thư mục `uploads/` như ảnh sân, nên ai có
 * link (dù khó đoán) cũng tải được mà không cần đăng nhập — kể cả người ngoài
 * chưa từng đăng nhập vào hệ thống. Giờ chỉ phục vụ qua
 * controllers/documentController.js (route có `protect`, tự kiểm tra người
 * gọi là admin hoặc đúng chủ của hồ sơ đó).
 */
const privateDir = path.join(process.env.PRIVATE_UPLOAD_DIR || 'private-uploads', 'owner-docs');

/**
 * NƠI LƯU: mặc định là MongoDB (collection PrivateFile) để chạy được trên
 * hosting có ổ đĩa tạm. Đặt PRIVATE_STORAGE=disk để dùng thư mục `privateDir`
 * như trước (VPS có ổ đĩa bền). File cũ đã nằm trên đĩa vẫn được phục vụ.
 */
const storage = privateFileStorage(privateDir);

const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file JPG, PNG, WEBP hoặc PDF'));
};

const uploadPrivate = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

uploadPrivate.PRIVATE_DIR = privateDir;   // để documentController/migrate dùng lại đúng 1 đường dẫn
module.exports = uploadPrivate;
