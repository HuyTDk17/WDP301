const rateLimit = require('express-rate-limit');
// Bắt buộc dùng khi tự viết keyGenerator có chạm tới IP: một địa chỉ IPv6 cấp
// cho người dùng thường là cả một dải /64, nên nếu lấy nguyên chuỗi IP làm khoá
// thì một người có thể đổi địa chỉ trong dải của mình để né giới hạn. Helper
// này chuẩn hoá về dải mạng thay vì từng địa chỉ.
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * GIỚI HẠN TẦN SUẤT.
 *
 * Bản cũ chỉ bảo vệ /api/auth. Các route còn lại — đặt sân, báo giá chuyển sân,
 * tạo URL thanh toán — hoàn toàn không giới hạn, nên một script đơn giản có thể
 * tạo hàng nghìn lượt giữ chỗ và khoá sạch lịch của mọi sân, hoặc bơm hàng loạt
 * giao dịch rác sang cổng thanh toán.
 *
 * LƯU Ý QUAN TRỌNG: express-rate-limit đếm theo IP lấy từ req.ip. Sau reverse
 * proxy (nginx, Cloudflare) thì mọi request đều mang IP của proxy nếu không bật
 * `app.set('trust proxy', ...)` ở server.js — khi đó toàn bộ người dùng dùng
 * chung một hạn mức và sẽ bị chặn oan.
 */

const json = (message) => ({ message });

// Đăng nhập/đăng ký: 10 lần / 15 phút / IP. Đủ thoải mái cho người gõ sai vài
// lần, nhưng chặn được dò mật khẩu tự động.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: json('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ít phút.'),
});

// Quên mật khẩu dễ bị lợi dụng để spam email / dò tài khoản tồn tại.
const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: json('Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau.'),
});

// Trần chung cho toàn bộ API. Rộng rãi để không cản trở người dùng thật (một
// phiên duyệt sân bình thường tốn vài chục request), chỉ nhằm chặn bot.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    // Webhook đối soát ngân hàng KHÔNG được giới hạn: dịch vụ bên thứ ba
    // (SePay, Casso...) có thể gọi dồn dập khi nhiều giao dịch phát sinh cùng
    // lúc; bản thân endpoint tự bảo vệ bằng khoá bí mật riêng.
    skip: (req) => req.path.startsWith('/api/payments/bank/webhook')
        || req.path === '/api/health',
    message: json('Bạn đang thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.'),
});

// Các thao tác tạo ra tài nguyên hoặc chạm vào tiền: giữ chỗ, tạo đơn, báo giá
// chuyển sân, tạo URL thanh toán. Siết chặt hơn trần chung.
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    // Đếm theo TÀI KHOẢN nếu đã đăng nhập: nhiều người dùng chung một mạng
    // (quán cà phê, ký túc xá, 4G NAT) không nên chặn lẫn nhau.
    keyGenerator: (req) => (req.user?._id ? `u:${req.user._id}` : `ip:${ipKeyGenerator(req.ip)}`),
    message: json('Bạn đang thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.'),
});

module.exports = { authLimiter, forgotPasswordLimiter, apiLimiter, writeLimiter };
