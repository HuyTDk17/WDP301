const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Đã có lỗi xảy ra trên hệ thống';

    if (err.name === 'CastError') { statusCode = 400; message = 'Định dạng ID không hợp lệ'; }
    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0];
        message = field === 'email' ? 'Email này đã được sử dụng' : 'Dữ liệu đã tồn tại trong hệ thống';
    }
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors).map((e) => e.message).join(', ');
    }
    if (err.name === 'MulterError') {
        statusCode = 400;
        message = err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh quá lớn, tối đa 2MB' : 'Tải ảnh lên không thành công';
    }
    if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Token không hợp lệ'; }
    if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Token đã hết hạn'; }

    res.status(statusCode).json({
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

const notFound = (req, res) => {
    res.status(404).json({ message: `Không tìm thấy đường dẫn: ${req.originalUrl}` });
};

module.exports = { errorHandler, notFound };
