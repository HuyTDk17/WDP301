require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const path = require('path');

// Kiểm tra cấu hình TRƯỚC khi làm bất cứ việc gì khác. Ở production, cấu hình
// sai sẽ dừng tiến trình ngay tại đây thay vì để hệ thống chạy và sai âm thầm.
const { check: checkEnv } = require('./config/env');
const envInfo = checkEnv();

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const withTransaction = require('./utils/withTransaction');

const authRoutes = require('./routes/authRoutes');
const venueRoutes = require('./routes/venueRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const transferRoutes = require('./routes/transferRoutes');
const documentRoutes = require('./routes/documentRoutes');
const jobs = require('./jobs');

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';

connectDB();
// Nạp tài khoản ngân hàng từ .env vào CSDL một lần cho lần triển khai đầu
// tiên — không ghi đè nếu admin đã cấu hình qua trang Cài đặt. Chạy bất đồng
// bộ, không chặn việc server lắng nghe cổng.
require('./utils/platformSettings').bootstrapBankFromEnv()
    .catch((err) => console.error('bootstrapBankFromEnv:', err.message));

// ============================================================
// PROXY
// ============================================================
// Chạy sau nginx/Cloudflare thì req.ip mặc định là IP của proxy, khiến giới hạn
// tần suất gom toàn bộ người dùng vào một hạn mức và chặn oan. Số 1 nghĩa là
// "tin đúng một lớp proxy đứng ngay trước" — KHÔNG dùng `true` vì như vậy là
// tin bất kỳ header X-Forwarded-For nào client tự bịa ra.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// ============================================================
// BẢO MẬT
// ============================================================
app.use(helmet({
    // Ảnh trong /uploads được load bằng thẻ <img> từ domain frontend khác nên
    // phải nới riêng chính sách này cho tài nguyên tĩnh.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // API trả JSON, không phục vụ HTML, nên CSP mặc định của helmet không có
    // tác dụng gì ở đây. CSP thật được đặt ở tầng nginx cho frontend.
    contentSecurityPolicy: false,
}));

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // Không có origin = request từ server-to-server, Postman, hoặc IPN của
        // cổng thanh toán — những thứ này không bị chính sách CORS chi phối.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Không được phép truy cập bởi CORS'));
    },
    credentials: true,
}));

// Giới hạn kích thước body: mặc định của express là 100kb, nhưng khai báo rõ để
// không ai vô tình nới lên và mở đường cho tấn công làm cạn bộ nhớ.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Loại bỏ key bắt đầu bằng "$" hoặc chứa "." trong body/params — chặn NoSQL
// injection kiểu gửi { "email": { "$gt": "" } } thay vì chuỗi bình thường.
app.use(mongoSanitize());

// Log: 'dev' ngắn gọn có màu cho máy cá nhân, 'combined' chuẩn Apache cho
// production để công cụ thu thập log đọc được.
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

// Trần chung cho toàn bộ API (IPN của cổng thanh toán được miễn trừ bên trong).
app.use(apiLimiter);

// ============================================================
// TÀI NGUYÊN TĨNH
// ============================================================
app.use('/uploads', express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads'), {
    maxAge: IS_PROD ? '7d' : 0,
    // Ảnh upload là nội dung do người dùng gửi lên: chặn trình duyệt tự đoán
    // kiểu tệp, tránh một file .jpg thực chất chứa HTML/JS được thực thi.
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

// ============================================================
// KIỂM TRA SỨC KHOẺ
// ============================================================
// Bản cũ luôn trả "ok" kể cả khi mất kết nối cơ sở dữ liệu, nên bộ cân bằng tải
// vẫn đẩy request vào một tiến trình đã hỏng.
app.get('/api/health', async (req, res) => {
    const dbState = mongoose.connection.readyState; // 1 = connected
    const healthy = dbState === 1;
    // Nguồn sự thật về tài khoản ngân hàng là CSDL (admin có thể cấu hình qua
    // trang Cài đặt mà không cần sửa .env), nên tra ở đây thay vì chỉ dựa vào
    // biến môi trường lúc khởi động.
    let bankConfigured = envInfo.hasBankAccount;
    if (healthy) {
        try {
            const settings = await require('./utils/platformSettings').getSettings();
            bankConfigured = !!(settings.bankBin && settings.bankAccountNumber);
        } catch { /* giữ giá trị suy từ env nếu tra CSDL lỗi */ }
    }
    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        db: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] ?? 'unknown',
        transactions: withTransaction.isSupported(),
        bankAccount: bankConfigured,
        email: envInfo.hasSmtp,
        imageStorage: envInfo.hasCloudinary ? 'cloudinary' : 'local-disk',
        uptimeSeconds: Math.round(process.uptime()),
    });
});

app.get('/api/settings/public', require('./controllers/settingsController').getPublicSettings);
app.get('/api/stats/public', require('./controllers/settingsController').getPublicStats);

// ============================================================
// ĐỊNH TUYẾN
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/owner-documents', documentRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/transfers', transferRoutes);
// Webhook ngân hàng → tự xác nhận chủ sân đã nộp phí dịch vụ (xác thực bằng BANK_WEBHOOK_SECRET)
app.post('/api/webhooks/bank', require('./controllers/settlementController').bankWebhook);

app.use(notFound);
app.use(errorHandler);

// ============================================================
// KHỞI ĐỘNG
// ============================================================
const PORT = process.env.PORT || 9999;
const server = app.listen(PORT, () => {
    console.log(`✅ Server đang chạy tại cổng ${PORT}`);
    // Chỉ một tiến trình được chạy tác vụ nền. Khi scale nhiều instance, đặt
    // RUN_JOBS=false ở các instance còn lại để không có hai tiến trình cùng
    // huỷ một đơn hoặc cùng hết hạn một yêu cầu chuyển sân.
    if (process.env.RUN_JOBS !== 'false') {
        jobs.start();
    } else {
        console.log('⏱️  Tác vụ nền bị tắt ở tiến trình này (RUN_JOBS=false)');
    }
});

// ============================================================
// TẮT MÁY AN TOÀN
// ============================================================
// Khi deploy bản mới, tiến trình cũ nhận SIGTERM. Nếu thoát ngay lập tức, những
// request đang dở — kể cả một giao dịch chuyển sân đang ghi sổ — sẽ bị cắt giữa
// chừng. Ở đây ta ngừng nhận request mới, chờ request đang chạy kết thúc, rồi
// mới đóng kết nối cơ sở dữ liệu.
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} — đang tắt máy chủ một cách an toàn...`);

    const force = setTimeout(() => {
        console.error('Hết thời gian chờ, buộc phải thoát.');
        process.exit(1);
    }, 15000);
    force.unref();

    server.close(async () => {
        try { await mongoose.connection.close(false); } catch { /* bỏ qua */ }
        console.log('Đã đóng máy chủ và kết nối cơ sở dữ liệu.');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Lỗi không được bắt ở đâu đó trong code: ghi log rồi thoát để trình quản lý
// tiến trình khởi động lại. Chạy tiếp với trạng thái không xác định nguy hiểm
// hơn nhiều so với việc restart.
process.on('unhandledRejection', (reason) => {
    console.error('❌ Promise bị từ chối mà không được xử lý:', reason);
    shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
    console.error('❌ Lỗi không được bắt:', err);
    shutdown('uncaughtException');
});

module.exports = app;
