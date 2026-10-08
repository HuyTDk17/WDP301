const multer = require('multer');
const path = require('path');
const { publicImageStorage } = require('./storageEngines');

/**
 * Ảnh sân. Lưu trên Cloudinary nếu đã cấu hình (xem utils/uploads.js), ngược
 * lại ghi vào thư mục UPLOAD_DIR. Chỉ nhận ảnh: các màn hình dùng middleware
 * này (thêm/sửa địa điểm) vốn chỉ cho chọn JPG/PNG/WEBP.
 */
const storage = publicImageStorage({
    folder: 'esport360/venues',
    // Thu nhỏ ảnh quá lớn ngay khi tải lên để tiết kiệm dung lượng gói miễn phí.
    transformation: [{ width: 1600, height: 1600, crop: 'limit' }, { quality: 'auto' }],
});

const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = upload;
