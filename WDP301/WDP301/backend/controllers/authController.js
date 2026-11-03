const crypto = require('crypto');
const User = require('../models/User');
const Notification = require('../models/Notification');
const generateToken = require('../utils/generateToken');
const asyncHandler = require('../utils/asyncHandler');
const mailer = require('../utils/mailer');
const googleAuth = require('../utils/googleAuth');
const avatars = require('../utils/avatars');
const { fileUrl, removeStoredFile, discardPrivateUploads } = require('../utils/uploads');

const normalizePhone = (phone = '') => String(phone).replace(/\D/g, '');

// Liên kết đặt lại mật khẩu sống 30 phút: đủ để người dùng mở hộp thư nhưng đủ
// ngắn để một email bị lộ về sau không còn dùng được.
const RESET_TTL_MINUTES = 30;
// Liên kết xác minh email sống lâu hơn (24 giờ) vì không có gì "nhạy cảm" bị lộ
// nếu email bị đọc trộm sau đó — chỉ là xác nhận địa chỉ, không đổi mật khẩu.
const VERIFY_EMAIL_TTL_HOURS = 24;

exports.register = asyncHandler(async (req, res) => {
    const { name, email, password, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Vui lòng điền đầy đủ họ tên, email và mật khẩu' });
    }
    if (!normalizedPhone) {
        return res.status(400).json({ message: 'Vui lòng nhập số điện thoại' });
    }
    if (normalizedPhone.length !== 10) {
        return res.status(400).json({ message: 'Số điện thoại phải gồm đúng 10 chữ số' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email này đã được sử dụng' });

    const user = await User.create({ name, email, password, phone: normalizedPhone, role: 'customer', status: 'active' });

    // TRƯỚC ĐÂY: không xác minh email — gửi mã xác minh ngay lúc đăng ký, nhưng
    // KHÔNG chặn việc tạo tài khoản/đăng nhập nếu gửi email thất bại (SMTP chưa
    // cấu hình, dịch vụ email tạm gián đoạn...). Người dùng vẫn dùng được tài
    // khoản bình thường, chỉ cần xác minh trước khi nộp hồ sơ làm chủ sân — xem
    // submitOwnerApplication bên dưới. Có thể gửi lại qua resendVerificationEmail.
    try {
        const rawToken = user.createEmailVerificationToken(VERIFY_EMAIL_TTL_HOURS * 60);
        await user.save({ validateBeforeSave: false });
        const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
        await mailer.sendMail({
            to: user.email,
            subject: 'Xác minh email ESport360',
            html: mailer.verifyEmailTemplate({
                name: user.name,
                verifyUrl: `${clientUrl}/verify-email/${rawToken}`,
                expiresHours: VERIFY_EMAIL_TTL_HOURS,
            }),
        });
    } catch (err) {
        console.error('Gửi email xác minh thất bại (không chặn đăng ký):', err.message);
    }

    const token = generateToken(user);
    res.status(201).json({ token, user: user.toSafeObject() });
});

exports.login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });

    // Cố tình trả cùng 1 thông báo dù email không tồn tại hay sai mật khẩu,
    // để không lộ ra việc 1 email cụ thể đã đăng ký tài khoản hay chưa.
    const genericError = { message: 'Email hoặc mật khẩu không đúng' };

    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(401).json(genericError);

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json(genericError);
    if (user.status === 'banned') {
        // Đây là điểm chạm DUY NHẤT mà 1 tài khoản bị khóa còn tiếp cận được —
        // họ không đăng nhập được nên không thể vào xem trang Thông báo. Vì vậy
        // lý do khóa phải nằm ngay trong thông báo lỗi này.
        return res.status(403).json({
            message: user.banReason
                ? `Tài khoản của bạn đã bị khóa. Lý do: ${user.banReason}`
                : 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ để biết thêm chi tiết.',
        });
    }

    const token = generateToken(user);
    res.json({ token, user: user.toSafeObject() });
});

/** Lý do KHÔNG cho tài khoản này vào bằng Google (null = cho phép). Phải gọi TRƯỚC
 *  mọi thay đổi lên tài khoản — xem ghi chú trong googleAuth. */
const googleLoginBlock = (user) => {
    if (user.status === 'banned') {
        return {
            status: 403,
            message: user.banReason
                ? `Tài khoản của bạn đã bị khóa. Lý do: ${user.banReason}`
                : 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ để biết thêm chi tiết.',
        };
    }
    // Tài khoản quản trị điều khiển tiền/duyệt hồ sơ — không mở thêm đường vào
    // qua tài khoản Google, bắt buộc dùng email + mật khẩu.
    if (user.role === 'admin') {
        return { status: 403, message: 'Tài khoản quản trị vui lòng đăng nhập bằng email và mật khẩu.' };
    }
    return null;
};

/**
 * @route POST /api/auth/google   { credential }
 * Đăng nhập VÀ đăng ký bằng Google trong một endpoint: chưa có tài khoản thì
 * tạo mới, đã có thì đăng nhập — người dùng không cần biết mình đã đăng ký hay chưa.
 */
exports.googleAuth = asyncHandler(async (req, res) => {
    let profile;
    try {
        profile = await googleAuth.verifyGoogleCredential(req.body.credential);
    } catch (err) {
        if (err instanceof googleAuth.GoogleAuthError) return res.status(err.status).json({ message: err.message });
        throw err;
    }

    let isNewUser = false;
    let user = await User.findOne({ googleId: profile.googleId }) || await User.findOne({ email: profile.email });

    // Chặn TRƯỚC khi liên kết/sửa bất cứ thứ gì. Nếu để kiểm tra ở cuối hàm, một
    // admin chưa liên kết Google (vd. admin seed, emailVerified mặc định false)
    // sẽ bị nhánh chống pre-hijacking bên dưới ĐỔI MẬT KHẨU thành ngẫu nhiên khi
    // ai đó sở hữu địa chỉ email đó trên Google bấm đăng nhập — tức khoá được
    // admin ra khỏi hệ thống — rồi mới bị từ chối.
    if (user) {
        const blocked = googleLoginBlock(user);
        if (blocked) return res.status(blocked.status).json({ message: blocked.message });
        // Tìm thấy theo EMAIL nhưng tài khoản đó đã liên kết với một Google khác (sub
        // khác) — vd. địa chỉ email được cấp lại cho người khác. Không tự động cho
        // vào: email trùng không đủ chứng minh là cùng một người.
        if (user.googleId && user.googleId !== profile.googleId) {
            return res.status(409).json({ message: 'Email này đã được liên kết với một tài khoản Google khác.' });
        }
    }

    if (!user || !user.googleId) {
        if (user) {
            // ---- Email này đã đăng ký bằng mật khẩu từ trước → LIÊN KẾT Google vào ----
            // Google đã xác minh người dùng sở hữu email này (verifyGoogleCredential
            // bắt buộc email_verified), nên liên kết là an toàn.
            user.googleId = profile.googleId;
            if (!user.emailVerified) {
                // Chống "pre-hijacking": kẻ tấn công có thể đã đăng ký sẵn bằng email
                // của nạn nhân (chưa xác minh) kèm mật khẩu do hắn biết, chờ nạn nhân
                // tới đăng nhập Google rồi vẫn giữ được quyền vào. Tài khoản chưa xác
                // minh email thì chưa chứng minh được chủ nhân thật — nên khi chủ thật
                // vừa chứng minh qua Google, ta đổi mật khẩu sang giá trị ngẫu nhiên
                // để mật khẩu cũ của kẻ đăng ký trước không còn dùng được.
                user.password = crypto.randomBytes(32).toString('hex');
                user.emailVerified = true;
                user.emailVerificationTokenHash = null;
                user.emailVerificationExpires = null;
            }
            if (!user.avatar && profile.picture) user.avatar = profile.picture;
            await user.save();
        } else {
            // ---- Chưa có tài khoản → TẠO MỚI ----
            try {
                user = await User.create({
                    name: profile.name,
                    email: profile.email,
                    // Schema bắt buộc có mật khẩu (≥ 8 ký tự). Tài khoản Google không dùng
                    // mật khẩu — đặt giá trị ngẫu nhiên không ai biết. Muốn đăng nhập bằng
                    // mật khẩu sau này thì dùng "Quên mật khẩu".
                    password: crypto.randomBytes(32).toString('hex'),
                    googleId: profile.googleId,
                    authProvider: 'google',
                    emailVerified: true,
                    avatar: profile.picture,
                    role: 'customer',
                    status: 'active',
                });
                isNewUser = true;
            } catch (err) {
                // Hai request đăng nhập Google đồng thời cho cùng một email: request
                // chậm hơn dính lỗi trùng khoá — lấy lại tài khoản request kia vừa tạo.
                if (err && err.code === 11000) {
                    user = await User.findOne({ $or: [{ googleId: profile.googleId }, { email: profile.email }] });
                    if (!user) throw err;
                } else {
                    throw err;
                }
            }
        }
    }

    // Kiểm tra lại cho trường hợp vừa phục hồi từ lỗi trùng khoá (tài khoản do request
    // khác tạo) — không tốn gì với các nhánh còn lại vì đã kiểm tra ở trên.
    const blockedAfter = googleLoginBlock(user);
    if (blockedAfter) return res.status(blockedAfter.status).json({ message: blockedAfter.message });

    res.status(isNewUser ? 201 : 200).json({ token: generateToken(user), user: user.toSafeObject(), isNewUser });
});

exports.getMe = asyncHandler(async (req, res) => {
    res.json({ user: req.user.toSafeObject() });
});

exports.becomeOwner = asyncHandler(async (req, res) => {
    return res.status(400).json({ message: 'Vui lòng gửi hồ sơ đăng ký chủ sân để quản trị viên xét duyệt' });
});

const submitOwnerApplicationImpl = asyncHandler(async (req, res) => {
    if (req.user.role === 'admin') {
        return res.status(400).json({ message: 'Tài khoản quản trị không thể đăng ký làm chủ sân' });
    }
    if (req.user.role === 'owner' && req.user.ownerApplicationStatus === 'approved') {
        return res.status(409).json({ message: 'Tài khoản của bạn đã là chủ sân' });
    }
    // TRƯỚC ĐÂY: không xác minh email/SĐT người nộp hồ sơ — ai cũng nộp được
    // bằng một email không có thật, khiến admin không có cách nào liên hệ lại
    // nếu cần xác minh thêm. Bắt buộc xác minh email trước (SĐT cần tích hợp
    // dịch vụ SMS riêng, chưa có trong hệ thống này).
    if (!req.user.emailVerified) {
        return res.status(403).json({
            message: 'Vui lòng xác minh email trước khi đăng ký làm chủ sân. Kiểm tra hộp thư hoặc bấm "Gửi lại email xác minh".',
            code: 'EMAIL_NOT_VERIFIED',
        });
    }

    const {
        businessName, taxId, businessAddress, businessPhone,
        legalRepresentative, licenseNumber, ownerApplicationNote,
    } = req.body;

    if (!businessName || !taxId || !businessAddress || !legalRepresentative || !licenseNumber) {
        return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin pháp lý bắt buộc' });
    }
    // TRƯỚC ĐÂY: không bắt buộc đính kèm giấy tờ nào — hồ sơ có thể chuyển
    // sang 'pending' chỉ với vài trường chữ tự khai, không có gì để admin đối
    // chiếu khi xét duyệt.
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'Vui lòng đính kèm ít nhất 1 giấy tờ pháp lý (giấy chứng nhận đăng ký kinh doanh...)' });
    }

    // TRƯỚC ĐÂY: url: `/uploads/${file.filename}` — nằm trong thư mục công
    // khai, ai có link cũng tải được không cần đăng nhập. uploadPrivate lưu
    // file vào thư mục riêng, đường dẫn dưới trỏ qua route có xác thực
    // (routes/documentRoutes.js, chỉ admin hoặc chính chủ hồ sơ mới xem được).
    const documents = (req.files || []).map((file) => ({
        url: `/owner-documents/${file.filename}`,
        name: file.originalname,
        type: file.mimetype,
    }));

    req.user.businessName = businessName;
    req.user.taxId = taxId;
    req.user.businessAddress = businessAddress;
    req.user.businessPhone = normalizePhone(businessPhone || req.user.phone);
    req.user.legalRepresentative = legalRepresentative;
    req.user.licenseNumber = licenseNumber;
    req.user.ownerApplicationNote = ownerApplicationNote || '';
    req.user.ownerApplicationStatus = 'pending';
    req.user.ownerApplicationSubmittedAt = new Date();
    req.user.ownerApplicationReviewedAt = null;
    req.user.ownerApplicationRejectionReason = '';
    if (documents.length) req.user.ownerApplicationDocuments = documents;
    await req.user.save();

    const admins = await User.find({ role: 'admin' }).select('_id');
    await Notification.insertMany(admins.map((admin) => ({
        userId: admin._id,
        type: 'owner_application',
        icon: '🏟️',
        title: 'Có hồ sơ chủ sân mới',
        message: `${req.user.name} vừa gửi hồ sơ đăng ký làm chủ sân: ${businessName}.`,
        link: '/admin/owners',
    })));

    await Notification.create({
        userId: req.user._id,
        type: 'owner_application',
        icon: '📄',
        title: 'Đã gửi hồ sơ chủ sân',
        message: 'Hồ sơ của bạn đã được gửi đến quản trị viên. Bạn sẽ nhận thông báo khi có kết quả xét duyệt.',
        link: '/owner-application',
    });

    res.json({ user: req.user.toSafeObject() });
});

// Multer đã lưu giấy tờ trước khi vào hàm trên; nếu hồ sơ bị từ chối (4xx/5xx) thì dọn chúng.
exports.submitOwnerApplication = (req, res, next) => {
    res.once('finish', () => { if (res.statusCode >= 400) discardPrivateUploads(req.files); });
    return submitOwnerApplicationImpl(req, res, next);
};

// ============================================================
// ĐẶT LẠI MẬT KHẨU
// ============================================================

/**
 * @route POST /api/auth/forgot-password
 *
 * Trước đây endpoint này trả 503 vĩnh viễn vì chưa có dịch vụ email. Với người
 * dùng thật, quên mật khẩu mà không khôi phục được nghĩa là mất tài khoản, mất
 * cả lịch sử đặt sân và số dư khuyến mãi.
 *
 * Hai điểm bảo mật cần giữ:
 *   1. Luôn trả CÙNG một thông báo dù email có tồn tại hay không — nếu không,
 *      endpoint này biến thành công cụ dò xem ai đã đăng ký tài khoản.
 *   2. Chỉ lưu bản băm của mã, không lưu mã gốc (xem models/User.js).
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Vui lòng nhập email' });

    if (!mailer.isConfigured()) {
        return res.status(503).json({
            message: 'Chức năng đặt lại mật khẩu chưa được cấu hình dịch vụ email. '
                + 'Vui lòng liên hệ bộ phận hỗ trợ.',
        });
    }

    const genericOk = {
        message: 'Nếu email này đã đăng ký tài khoản, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. '
            + 'Vui lòng kiểm tra cả hộp thư rác.',
    };

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    // Không tồn tại, hoặc bị khoá: vẫn trả về đúng thông báo trên.
    if (!user || user.status === 'banned') return res.json(genericOk);

    const rawToken = user.createPasswordResetToken(RESET_TTL_MINUTES);
    await user.save({ validateBeforeSave: false });

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
    const resetUrl = `${clientUrl}/reset-password/${rawToken}`;

    try {
        await mailer.sendMail({
            to: user.email,
            subject: 'Đặt lại mật khẩu ESport360',
            html: mailer.resetPasswordTemplate({
                name: user.name, resetUrl, expiresMinutes: RESET_TTL_MINUTES,
            }),
        });
    } catch (err) {
        // Gửi thất bại thì phải xoá mã đi: để lại một mã còn hiệu lực mà người
        // dùng không bao giờ nhận được chỉ làm tăng bề mặt tấn công.
        user.resetPasswordTokenHash = null;
        user.resetPasswordExpires = null;
        await user.save({ validateBeforeSave: false });
        console.error('Gửi email đặt lại mật khẩu thất bại:', err.message);
        return res.status(502).json({
            message: 'Không gửi được email vào lúc này. Vui lòng thử lại sau ít phút.',
        });
    }

    res.json(genericOk);
});

/** @route POST /api/auth/reset-password/:token */
exports.resetPassword = asyncHandler(async (req, res) => {
    const { password } = req.body;
    if (!password || String(password).length < 8) {
        return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    }

    const tokenHash = User.hashResetToken(req.params.token);
    const user = await User.findOne({
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpires: { $gt: new Date() },
    }).select('+password +resetPasswordTokenHash +resetPasswordExpires');

    if (!user) {
        return res.status(400).json({
            message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại.',
        });
    }

    user.password = password;
    // Mã dùng MỘT LẦN: xoá ngay để không ai dùng lại liên kết cũ.
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    await Notification.create({
        userId: user._id,
        type: 'security', icon: '🔐',
        title: 'Mật khẩu đã được thay đổi',
        message: 'Mật khẩu tài khoản của bạn vừa được đặt lại. Nếu không phải bạn thực hiện, '
            + 'hãy liên hệ bộ phận hỗ trợ ngay.',
        link: '/profile',
    }).catch(() => {});

    // Cấp token mới để người dùng vào thẳng ứng dụng, không phải đăng nhập lại.
    res.json({ token: generateToken(user), user: user.toSafeObject() });
});

/** @route POST /api/auth/verify-email/:token — không cần đăng nhập, bản thân
 *  mã trong URL đã xác định đúng tài khoản. */
exports.verifyEmail = asyncHandler(async (req, res) => {
    const tokenHash = User.hashEmailVerificationToken(req.params.token);
    const user = await User.findOne({
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpires: { $gt: new Date() },
    }).select('+emailVerificationTokenHash +emailVerificationExpires');

    if (!user) {
        return res.status(400).json({
            message: 'Liên kết xác minh không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu gửi lại.',
        });
    }

    user.emailVerified = true;
    // Mã dùng MỘT LẦN: xoá ngay để không ai dùng lại liên kết cũ.
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpires = null;
    await user.save({ validateBeforeSave: false });

    res.json({ message: 'Xác minh email thành công', user: user.toSafeObject() });
});

/** @route POST /api/auth/resend-verification — yêu cầu đăng nhập, để không lộ
 *  ra qua email nào đã đăng ký tài khoản (khác forgotPassword — ở đó người
 *  dùng chưa chắc đã đăng nhập được nên phải nhận email làm tham số). */
exports.resendVerificationEmail = asyncHandler(async (req, res) => {
    if (req.user.emailVerified) {
        return res.status(400).json({ message: 'Email của bạn đã được xác minh rồi' });
    }
    if (!mailer.isConfigured()) {
        return res.status(503).json({
            message: 'Chức năng gửi email chưa được cấu hình. Vui lòng liên hệ bộ phận hỗ trợ.',
        });
    }

    const rawToken = req.user.createEmailVerificationToken(VERIFY_EMAIL_TTL_HOURS * 60);
    await req.user.save({ validateBeforeSave: false });
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();

    try {
        await mailer.sendMail({
            to: req.user.email,
            subject: 'Xác minh email ESport360',
            html: mailer.verifyEmailTemplate({
                name: req.user.name,
                verifyUrl: `${clientUrl}/verify-email/${rawToken}`,
                expiresHours: VERIFY_EMAIL_TTL_HOURS,
            }),
        });
    } catch (err) {
        req.user.emailVerificationTokenHash = null;
        req.user.emailVerificationExpires = null;
        await req.user.save({ validateBeforeSave: false });
        console.error('Gửi lại email xác minh thất bại:', err.message);
        return res.status(502).json({ message: 'Không gửi được email vào lúc này. Vui lòng thử lại sau ít phút.' });
    }

    res.json({ message: 'Đã gửi lại email xác minh. Vui lòng kiểm tra hộp thư (kể cả thư rác).' });
});

// ============================================================
// HỒ SƠ
// ============================================================

exports.updateProfile = asyncHandler(async (req, res) => {
    // Trường thông tin cá nhân — ai cũng sửa được.
    const commonFields = ['name', 'phone', 'bio', 'city'];
    // Trường thông tin doanh nghiệp/ngân hàng — CHỈ chủ sân đã được duyệt mới
    // được sửa qua đây, để không ai né được quy trình xét duyệt hồ sơ chủ sân.
    const ownerFields = ['businessName', 'taxId', 'bankName', 'bankAccount', 'bankBin', 'bankAccountName'];
    const allowedFields = req.user.role === 'owner' ? [...commonFields, ...ownerFields] : commonFields;

    if (req.body.phone !== undefined) {
        const normalizedPhone = normalizePhone(req.body.phone);
        if (normalizedPhone && normalizedPhone.length !== 10) {
            return res.status(400).json({ message: 'Số điện thoại phải gồm đúng 10 chữ số' });
        }
        req.body.phone = normalizedPhone;
    }

    // Tài khoản này là nơi KHÁCH CHUYỂN KHOẢN TRỰC TIẾP khi đặt sân — kiểm tra kỹ
    // định dạng, vì sai một chữ số là khách chuyển nhầm tiền và mã QR vô dụng.
    if (req.user.role === 'owner') {
        const b = req.body;
        if (b.bankBin !== undefined) {
            b.bankBin = String(b.bankBin).trim();
            if (b.bankBin && !/^\d{3,6}$/.test(b.bankBin)) {
                return res.status(400).json({ message: 'Mã BIN ngân hàng không hợp lệ — hãy chọn ngân hàng từ danh sách' });
            }
        }
        if (b.bankAccount !== undefined) {
            b.bankAccount = String(b.bankAccount).replace(/\s+/g, '');
            if (b.bankAccount && !/^\d{4,20}$/.test(b.bankAccount)) {
                return res.status(400).json({ message: 'Số tài khoản chỉ gồm chữ số (4–20 chữ số)' });
            }
        }
        if (b.bankAccountName !== undefined) {
            // Tên chủ tài khoản trên ngân hàng luôn không dấu, viết hoa.
            b.bankAccountName = String(b.bankAccountName).trim()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
                .replace(/\s+/g, ' ').toUpperCase();
        }
    }

    // TRƯỚC ĐÂY: chủ sân đã duyệt tự đổi số tài khoản/tên ngân hàng qua đây mà
    // không ai được báo — kỳ chi trả sau sẽ đi theo tài khoản mới trong im
    // lặng. Phát hiện thay đổi TRƯỚC khi ghi đè, để so sánh được giá trị cũ/mới.
    const bankFieldsChanged = req.user.status === 'verified'
        && ['bankName', 'bankAccount', 'bankBin', 'bankAccountName']
            .some((f) => req.body[f] !== undefined && req.body[f] !== req.user[f]);
    const oldBank = { bankName: req.user.bankName, bankAccount: req.user.bankAccount };

    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) req.user[field] = req.body[field];
    });

    if (bankFieldsChanged) {
        req.user.bankInfoPendingReview = true;
        req.user.bankInfoChangedAt = new Date();
        req.user.bankInfoConfirmedAt = null;
        req.user.bankInfoConfirmedBy = null;

        const mask = (acc) => (acc ? `••••${String(acc).slice(-4)}` : '(trống)');
        const admins = await User.find({ role: 'admin' }).select('_id');
        await Promise.all(admins.map((admin) => Notification.create({
            userId: admin._id,
            type: 'owner_bank_change',
            icon: '⚠️',
            title: `Chủ sân "${req.user.name}" vừa đổi thông tin ngân hàng`,
            message: `${req.user.bankName || '(trống)'} ${mask(req.user.bankAccount)} — trước đó là ${oldBank.bankName || '(trống)'} ${mask(oldBank.bankAccount)}. `
                + 'Vui lòng xác minh với chủ sân (gọi điện) trước khi chi trả kỳ tiếp theo.',
            link: `/admin/owners/${req.user._id}`,
        })));
    }

    await req.user.save();
    res.json({ user: req.user.toSafeObject() });
});

exports.changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) {
        return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    }
    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Đổi mật khẩu thành công' });
});

/** Xoá ảnh cũ người dùng đã tải lên (cục bộ hoặc Cloudinary) để kho lưu trữ không phình mãi. */
const removeOldUpload = removeStoredFile;

// @route POST /api/auth/avatar  (multipart, field 'avatar') — tải ảnh riêng lên
exports.uploadAvatar = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn ảnh để tải lên' });
    const old = req.user.avatar;
    const avatarUrl = fileUrl(req.file);
    req.user.avatar = avatarUrl;
    await req.user.save();
    removeOldUpload(old);
    res.json({ avatarUrl, user: req.user.toSafeObject() });
});

// @route PUT /api/auth/avatar  { avatar: 'preset:avatar-03' | null }
// Chọn avatar dựng sẵn, hoặc null để về ảnh mặc định (chữ cái đầu).
exports.setAvatar = asyncHandler(async (req, res) => {
    const { avatar } = req.body || {};
    if (avatar !== null && !avatars.isValidPreset(avatar)) {
        return res.status(400).json({ message: 'Avatar không hợp lệ' });
    }
    const old = req.user.avatar;
    req.user.avatar = avatar;
    await req.user.save();
    removeOldUpload(old);
    res.json({ user: req.user.toSafeObject() });
});
