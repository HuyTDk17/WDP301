const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: [true, 'Vui lòng nhập họ tên'], trim: true },
        email: { type: String, required: [true, 'Vui lòng nhập email'], unique: true, lowercase: true, trim: true },
        password: { type: String, required: [true, 'Vui lòng nhập mật khẩu'], minlength: [8, 'Mật khẩu phải có ít nhất 8 ký tự'], select: false },
        phone: {
            type: String,
            default: '',
            validate: {
                validator: (value) => !value || /^\d{10}$/.test(value),
                message: 'Số điện thoại phải gồm đúng 10 chữ số',
            },
        },
        role: { type: String, enum: ['customer', 'owner', 'admin'], default: 'customer' },
        // ===== ĐĂNG NHẬP BẰNG GOOGLE =====
        // googleId = trường `sub` trong ID token Google — định danh ỔN ĐỊNH của tài
        // khoản Google (khác với email, email có thể đổi). KHÔNG dùng `sparse`:
        // index sparse chỉ bỏ qua field VẮNG MẶT chứ không bỏ qua giá trị null
        // tường minh, nên `default: null` + unique sẽ khiến người dùng thứ hai
        // đăng ký thường bị lỗi trùng khoá. Dùng partial index ở cuối file
        // (chỉ ràng buộc unique với googleId là chuỗi thật), field để trống
        // (undefined) khi không dùng.
        // authProvider chỉ để hiển thị/thống kê: 'google' = tạo mới bằng Google,
        // 'local' = tạo bằng email + mật khẩu (kể cả sau đó có liên kết thêm Google).
        googleId: { type: String, default: undefined },
        authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
        avatar: { type: String, default: null },
        bio: { type: String, default: '' },
        city: { type: String, default: '' },
        businessName: { type: String, default: '' },
        taxId: { type: String, default: '' },
        businessAddress: { type: String, default: '' },
        businessPhone: { type: String, default: '' },
        legalRepresentative: { type: String, default: '' },
        licenseNumber: { type: String, default: '' },
        ownerApplicationStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
        ownerApplicationDocuments: [{
            url: { type: String, required: true },
            name: { type: String, default: '' },
            type: { type: String, default: '' },
        }],
        ownerApplicationNote: { type: String, default: '' },
        ownerApplicationSubmittedAt: { type: Date, default: null },
        ownerApplicationReviewedAt: { type: Date, default: null },
        // Admin nào đã duyệt/từ chối — TRƯỚC ĐÂY chỉ ghi lúc duyệt, không ghi ai
        // duyệt, nên không tra được trách nhiệm khi có tranh chấp/khiếu nại.
        ownerApplicationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        ownerApplicationRejectionReason: { type: String, default: '' },
        bankName: { type: String, default: '' },
        bankAccount: { type: String, default: '' },
        // Mã BIN (chuẩn Napas) và tên chủ tài khoản — cần thêm để sinh được mã
        // QR VietQR khi KHÁCH CHUYỂN KHOẢN TRỰC TIẾP cho chủ sân lúc đặt sân.
        // Danh sách mã: https://api.vietqr.io/v2/banks
        bankBin: { type: String, default: '' },
        bankAccountName: { type: String, default: '' },   // Không dấu, viết hoa, đúng như trên tài khoản
        // TRƯỚC ĐÂY: chủ sân đã duyệt tự đổi bankName/bankAccount qua trang hồ sơ
        // của họ, không ai được báo, không có log — tiền chi trả kỳ sau sẽ đi
        // theo tài khoản MỚI mà admin không hề hay biết đã đổi. Các trường dưới
        // đây tạo một "chốt chặn": đổi xong sẽ bị đánh dấu "chờ xác minh", và
        // authController.updateProfile / settlementService.issueSettlement
        // dựa vào cờ này để chặn admin ghi nhận thanh toán cho tới khi xác nhận.
        bankInfoPendingReview: { type: Boolean, default: false },
        bankInfoChangedAt: { type: Date, default: null },
        bankInfoConfirmedAt: { type: Date, default: null },
        bankInfoConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        status: { type: String, enum: ['active', 'pending', 'verified', 'banned', 'rejected'], default: 'active' },
        banReason: { type: String, default: '' },
        // Số dư khuyến mãi (VNĐ) — phát sinh khi chuyển sân sang sân rẻ hơn mà
        // phần chênh vượt trần hoàn tiền mặt. Chỉ dùng trừ vào đơn sau, KHÔNG
        // rút được thành tiền. Vòng đời đầy đủ ở utils/credit.js.
        creditBalance: { type: Number, default: 0, min: 0 },

        // ===== XÁC MINH EMAIL =====
        // TRƯỚC ĐÂY: không xác minh email khi đăng ký — ai cũng đăng ký được
        // bằng một email không có thật (hoặc email của người khác) rồi nộp hồ
        // sơ làm chủ sân, khiến admin không có cách nào liên hệ lại nếu cần.
        // Không chặn đăng nhập bình thường (tài khoản vẫn dùng được ngay để
        // không phá luồng trải nghiệm hiện có), nhưng bắt buộc xác minh trước
        // khi nộp hồ sơ đăng ký làm chủ sân — xem authController.submitOwnerApplication.
        emailVerified: { type: Boolean, default: false },
        emailVerificationTokenHash: { type: String, default: null, select: false },
        emailVerificationExpires: { type: Date, default: null, select: false },

        // ===== ĐẶT LẠI MẬT KHẨU =====
        // Lưu BẢN BĂM của mã, không lưu mã gốc. Nếu cơ sở dữ liệu bị lộ, kẻ tấn
        // công vẫn không dựng lại được liên kết đặt lại mật khẩu hợp lệ — cùng
        // một lý do vì sao mật khẩu không bao giờ được lưu dạng gốc.
        resetPasswordTokenHash: { type: String, default: null, select: false },
        resetPasswordExpires: { type: Date, default: null, select: false },
    },
    { timestamps: true }
);

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Sinh mã đặt lại mật khẩu. Trả về mã GỐC để gửi qua email; chỉ bản băm được
 * lưu xuống cơ sở dữ liệu.
 */
userSchema.methods.createPasswordResetToken = function (ttlMinutes = 30) {
    const raw = crypto.randomBytes(32).toString('hex');
    this.resetPasswordTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    this.resetPasswordExpires = new Date(Date.now() + ttlMinutes * 60 * 1000);
    return raw;
};

/** Băm mã người dùng gửi lên để so với bản đã lưu. */
userSchema.statics.hashResetToken = function (raw) {
    return crypto.createHash('sha256').update(String(raw)).digest('hex');
};

/** Sinh mã xác minh email — cùng cơ chế băm với mã đặt lại mật khẩu ở trên. */
userSchema.methods.createEmailVerificationToken = function (ttlMinutes = 60 * 24) {
    const raw = crypto.randomBytes(32).toString('hex');
    this.emailVerificationTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    this.emailVerificationExpires = new Date(Date.now() + ttlMinutes * 60 * 1000);
    return raw;
};

userSchema.statics.hashEmailVerificationToken = function (raw) {
    return crypto.createHash('sha256').update(String(raw)).digest('hex');
};

userSchema.methods.toSafeObject = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.resetPasswordTokenHash;
    delete obj.resetPasswordExpires;
    delete obj.emailVerificationTokenHash;
    delete obj.emailVerificationExpires;
    return obj;
};

// Dọn mã đã hết hạn. TTL index của MongoDB xoá document khi tới hạn, nhưng ở
// đây ta chỉ muốn xoá TRƯỜNG chứ không xoá tài khoản — nên việc dọn dẹp được
// làm trong jobs/index.js, index này chỉ để tra cứu nhanh.
userSchema.index({ resetPasswordTokenHash: 1 }, { sparse: true });
userSchema.index({ emailVerificationTokenHash: 1 }, { sparse: true });
// Mỗi tài khoản Google chỉ liên kết được với MỘT user. Partial index thay vì
// sparse — xem ghi chú ở field googleId phía trên.
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });

module.exports = mongoose.model('User', userSchema);
