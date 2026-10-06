const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

const protect = asyncHandler(async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        return res.status(401).json({ message: 'Bạn cần đăng nhập để thực hiện hành động này' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ message: 'Tài khoản không còn tồn tại' });
        if (user.status === 'banned') return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' });
    }
});

const authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập tài nguyên này' });
    }
    next();
};

// Dùng cho route CÔNG KHAI nhưng cần biết "ai đang xem" nếu có đăng nhập, để
// hiển thị khác đi cho đúng chủ sở hữu/admin (vd: venueController.getVenueById
// cho phép chủ sân/admin xem được cả địa điểm đang bị ẩn, còn người khác thì
// không). KHÁC với `protect`: không có token, token sai, hay tài khoản bị
// khóa đều KHÔNG chặn request — chỉ đơn giản là req.user sẽ là `null`.
const optionalAuth = asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) { req.user = null; return next(); }
    try {
        const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        req.user = user && user.status !== 'banned' ? user : null;
    } catch (error) {
        req.user = null;
    }
    next();
});

module.exports = { protect, authorize, optionalAuth };
