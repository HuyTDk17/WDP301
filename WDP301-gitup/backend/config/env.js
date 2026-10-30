/**
 * KIỂM TRA BIẾN MÔI TRƯỜNG NGAY LÚC KHỞI ĐỘNG.
 *
 * Lý do tồn tại: những lỗi cấu hình nguy hiểm nhất đều KHÔNG làm ứng dụng sập —
 * nó vẫn chạy bình thường và chỉ sai âm thầm. JWT_SECRET để nguyên giá trị mẫu
 * thì ai cũng ký được token admin. Thiếu TZ thì lead time lệch 7 tiếng và tra
 * sai bậc phí chuyển sân. Thiếu thông tin tài khoản ngân hàng thì khách không
 * biết chuyển tiền vào đâu.
 *
 * Nguyên tắc: ở production, sai cấu hình thì DỪNG HẲN. Ở development chỉ cảnh
 * báo, để không cản trở việc chạy máy cá nhân.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

// Những giá trị mẫu tuyệt đối không được mang lên chạy thật.
const FORBIDDEN_SECRETS = [
    'your_secret_key', 'secret', 'changeme', 'change_me', 'jwt_secret', '123456',
];

const errors = [];
const warnings = [];

const hasMail = () => !!(
    (process.env.BREVO_API_KEY && process.env.MAIL_FROM)
    || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
);
const hasCloudinary = () => !!(
    process.env.CLOUDINARY_URL
    || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

function required(name, { minLength = 0 } = {}) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        errors.push(`Thiếu biến môi trường bắt buộc: ${name}`);
        return null;
    }
    if (minLength && value.length < minLength) {
        errors.push(`${name} quá ngắn (cần ít nhất ${minLength} ký tự, đang có ${value.length})`);
    }
    return value;
}

function check() {
    // ===== Bắt buộc ở mọi môi trường =====
    required('MONGO_URI');
    const jwtSecret = required('JWT_SECRET', { minLength: IS_PROD ? 32 : 8 });

    if (jwtSecret && FORBIDDEN_SECRETS.includes(jwtSecret.toLowerCase())) {
        errors.push(
            'JWT_SECRET đang là giá trị mẫu. Sinh khoá mới bằng:\n' +
            '        node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
        );
    }

    // ===== Chỉ bắt buộc ở production =====
    if (IS_PROD) {
        required('CLIENT_URL');
        required('SERVER_URL');

        if (!/replicaSet=/.test(process.env.MONGO_URI || '')) {
            errors.push(
                'MONGO_URI không trỏ tới replica set. Nghiệp vụ chuyển sân đụng tiền của ba bên\n' +
                '        nên bắt buộc phải có giao dịch (transaction), mà giao dịch của MongoDB chỉ\n' +
                '        hoạt động trên replica set. Ví dụ:\n' +
                '        MONGO_URI=mongodb://mongo:27017/esport360?replicaSet=rs0'
            );
        }

        if ((process.env.CLIENT_URL || '').includes('localhost')) {
            warnings.push('CLIENT_URL vẫn trỏ về localhost — CORS sẽ chặn tên miền thật');
        }
        if (!/^https:/.test(process.env.SERVER_URL || '')) {
            warnings.push('SERVER_URL không dùng https');
        }

        const bankReady = process.env.BANK_BIN && process.env.BANK_ACCOUNT_NUMBER;
        if (!bankReady) {
            warnings.push(
                'Chưa cấu hình tài khoản ngân hàng qua biến môi trường (BANK_BIN / BANK_ACCOUNT_NUMBER). '
                + 'Máy chủ vẫn khởi động, nhưng khách sẽ không đặt được sân cho tới khi bạn điền thông tin '
                + 'này trong trang Cài đặt (Admin) hoặc thêm vào .env rồi khởi động lại.'
            );
        }
        if (!hasMail()) {
            warnings.push('Chưa cấu hình email (BREVO_API_KEY + MAIL_FROM, hoặc SMTP_HOST/USER/PASS) — quên mật khẩu và xác minh email sẽ trả lỗi 503');
        }
        if (!hasCloudinary()) {
            warnings.push(
                'Chưa cấu hình Cloudinary (CLOUDINARY_URL) — ảnh sân và ảnh đại diện sẽ lưu trên ổ đĩa máy chủ. '
                + 'Nếu hosting có ổ đĩa tạm (Render free...) thì ảnh sẽ MẤT sau mỗi lần khởi động lại.'
            );
        }
    }

    // ===== Múi giờ =====
    // Đây là lỗi tiền bạc chứ không phải lỗi hiển thị: toàn bộ việc tra bậc phí
    // chuyển sân và bậc bồi thường đều dựa trên "còn bao nhiêu giờ nữa tới giờ
    // đá". Lệch múi giờ 7 tiếng là tra nhầm bậc và thu sai tiền.
    const offset = Number(process.env.APP_TZ_OFFSET_MINUTES ?? 420);
    if (Number.isNaN(offset)) {
        errors.push('APP_TZ_OFFSET_MINUTES phải là một số (Việt Nam = 420)');
    }

    // ===== Kết luận =====
    if (warnings.length) {
        console.warn('\n⚠️  CẢNH BÁO CẤU HÌNH:');
        warnings.forEach((w) => console.warn(`   • ${w}`));
    }

    if (errors.length) {
        console.error(IS_PROD
            ? '\n❌ CẤU HÌNH KHÔNG HỢP LỆ — máy chủ dừng khởi động:\n'
            : '\n❌ CẤU HÌNH KHÔNG HỢP LỆ (sẽ chặn khởi động khi NODE_ENV=production):\n');
        errors.forEach((e) => console.error(`   • ${e}`));
        console.error('\n   Xem deploy/DEPLOY.md và backend/.env.example để biết cách điền.\n');
        if (IS_PROD) process.exit(1);
        console.error('   (Đang ở chế độ development nên vẫn chạy tiếp — KHÔNG được làm vậy ở production)\n');
    } else {
        console.log(`✅ Cấu hình hợp lệ (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
    }

    return {
        isProd: IS_PROD,
        tzOffsetMinutes: Number.isNaN(offset) ? 420 : offset,
        hasBankAccount: !!(process.env.BANK_BIN && process.env.BANK_ACCOUNT_NUMBER),
        hasSmtp: hasMail(),   // tên cũ giữ lại cho /api/health; nay gồm cả Brevo
        hasCloudinary: hasCloudinary(),
    };
}

module.exports = { check, IS_PROD };
