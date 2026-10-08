const PlatformSetting = require('../models/PlatformSetting');
const Venue = require('../models/Venue');
const Booking = require('../models/Booking');
const asyncHandler = require('../utils/asyncHandler');
const { getSettings, invalidateCache } = require('../utils/platformSettings');

// @route   GET /api/stats/public (không cần đăng nhập)
// TRƯỚC ĐÂY: trang chủ hiển thị số liệu bịa cứng trong code ("2.500+ sân",
// "180K+ người chơi", "50+ thành phố", "+47% tăng doanh thu") — với một nền
// tảng vừa mở, đây là quảng cáo sai sự thật với người dùng thật. Endpoint này
// trả số liệu THẬT tính từ dữ liệu hiện có; ban đầu số sẽ nhỏ (thậm chí 0) và
// tăng dần đúng với thực tế, thay vì một con số cố định không bao giờ đúng.
exports.getPublicStats = asyncHandler(async (req, res) => {
    const activeVenueFilter = { status: 'approved', isActive: true };
    const [venues, cities, players, bookings, ratingAgg] = await Promise.all([
        Venue.countDocuments(activeVenueFilter),
        Venue.distinct('address.city', activeVenueFilter),
        // "Người chơi" = khách hàng đã THỰC SỰ chơi (đơn đã hoàn tất), không
        // tính đơn mới đặt/chưa diễn ra để tránh phóng đại.
        Booking.distinct('customerId', { status: 'completed' }),
        // "Lượt đặt sân" = tổng số đơn đã hoàn tất (khác với "players" ở trên —
        // một khách có thể đặt nhiều lượt). Dùng cho trang đăng nhập/đăng ký.
        Booking.countDocuments({ status: 'completed' }),
        Venue.aggregate([
            { $match: { ...activeVenueFilter, reviewCount: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$rating' }, totalReviews: { $sum: '$reviewCount' } } },
        ]),
    ]);
    res.json({
        venues,
        cities: cities.filter(Boolean).length,
        players: players.length,
        bookings,
        avgRating: ratingAgg[0] ? Math.round(ratingAgg[0].avg * 10) / 10 : null,
        totalReviews: ratingAgg[0]?.totalReviews || 0,
    });
});

// @route   GET /api/settings/public (không cần đăng nhập)
// Chỉ trả về các field không nhạy cảm — dùng để frontend hiển thị đúng % phí
// dịch vụ khi xem trước giá đặt sân, thay vì hardcode 0.05 rải rác nhiều nơi.
exports.getPublicSettings = asyncHandler(async (req, res) => {
    const settings = await getSettings();
    res.json({
        platformName: settings.platformName,
        supportEmail: settings.supportEmail,
        commissionRate: settings.commissionRate,
        // Phần % hoa hồng khách chịu — để trang đặt sân hiển thị đúng phí khách phải trả
        commissionCustomerSharePct: settings.commissionCustomerSharePct ?? 0,
        // Giao diện đặt sân và chuyển sân cần biết chính sách để hiển thị đúng
        // chi phí cho khách TRƯỚC khi họ thao tác.
        transferEnabled: settings.transferEnabled,
        transferMinLeadTimeHours: settings.transferMinLeadTimeHours,
        maxTransfersPerBooking: settings.maxTransfersPerBooking,
        transferFeeTiers: settings.transferFeeTiers,
        compensationTiers: settings.compensationTiers,
        transferFeeMin: settings.transferFeeMin,
        transferFeeMax: settings.transferFeeMax,
        maxRefundRatio: settings.maxRefundRatio,
        cancellationTiers: settings.cancellationTiers,
        // Không lộ gì nhạy cảm — số tài khoản vốn đã hiển thị công khai trên
        // hoá đơn của bất kỳ ai chuyển khoản, chỉ dùng để trang chủ/footer
        // hiển thị "Chấp nhận thanh toán qua chuyển khoản ngân hàng".
        bankConfigured: !!(settings.bankBin && settings.bankAccountNumber),
        bankName: settings.bankName,
    });
});

// @route   GET /api/admin/settings
exports.getPlatformSettings = asyncHandler(async (req, res) => {
    const settings = await getSettings();
    res.json({ settings });
});

// @route   PUT /api/admin/settings
// Các trường số đơn giản: kiểm tra chung một chỗ thay vì viết if lặp lại.
const NUMERIC_FIELDS = {
    gatewayFeeRate: { min: 0, max: 1 },
    transferMinLeadTimeHours: { min: 0, max: 72 },
    maxTransfersPerBooking: { min: 0, max: 10 },
    quoteTtlMinutes: { min: 1, max: 60 },
    ownerApprovalTimeoutMinutes: { min: 1, max: 1440 },
    transferFeeMin: { min: 0 },
    transferFeeMax: { min: 0 },
    transferFixedFeeT5: { min: 0 },
    maxRefundRatio: { min: 0, max: 1 },
    // Đối soát hoa hồng với chủ sân
    commissionDueDays: { min: 1, max: 90 },
    commissionGraceDays: { min: 0, max: 90 },
};

/** Biểu phí bậc thang phải là mảng hợp lệ, tỉ lệ trong [0,1]. */
function validateTiers(tiers, rateKeys, label) {
    if (!Array.isArray(tiers) || tiers.length === 0) return `${label} phải là danh sách có ít nhất một bậc`;
    for (const tier of tiers) {
        if (!(Number(tier.minLeadHours) >= 0)) return `${label}: ngưỡng giờ phải là số không âm`;
        for (const key of rateKeys) {
            const v = Number(tier[key]);
            if (Number.isNaN(v) || v < 0 || v > 1) return `${label}: tỉ lệ phải là số thập phân từ 0 đến 1 (0.05 = 5%)`;
        }
    }
    return null;
}

exports.updatePlatformSettings = asyncHandler(async (req, res) => {
    const {
        platformName, supportEmail, commissionRate, commissionCustomerSharePct,
        bankName, bankBin, bankAccountNumber, bankAccountName,
    } = req.body;

    if (commissionRate !== undefined) {
        const rate = Number(commissionRate);
        if (Number.isNaN(rate) || rate < 0 || rate > 100) {
            return res.status(400).json({ message: 'Tỉ lệ hoa hồng phải là số từ 0 đến 100' });
        }
    }
    if (commissionCustomerSharePct !== undefined) {
        const c = Number(commissionCustomerSharePct);
        if (Number.isNaN(c) || c < 0 || c > 100) {
            return res.status(400).json({ message: 'Phần hoa hồng khách chịu phải là số từ 0 đến 100' });
        }
    }
    if (supportEmail !== undefined && supportEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail.trim())) {
        return res.status(400).json({ message: 'Email hỗ trợ không hợp lệ' });
    }
    // Mã BIN theo chuẩn Napas là chuỗi số — sai định dạng thì mã QR VietQR sẽ
    // không sinh ra được ảnh hợp lệ mà không có lỗi rõ ràng nào báo lại.
    if (bankBin !== undefined && bankBin.trim() && !/^\d{3,6}$/.test(bankBin.trim())) {
        return res.status(400).json({ message: 'Mã BIN ngân hàng không hợp lệ — xem danh sách tại https://api.vietqr.io/v2/banks' });
    }
    if (bankAccountNumber !== undefined && bankAccountNumber.trim() && !/^\d{4,20}$/.test(bankAccountNumber.trim())) {
        return res.status(400).json({ message: 'Số tài khoản chỉ được chứa chữ số' });
    }

    let settings = await PlatformSetting.findOne({ singleton: 'main' });
    if (!settings) settings = new PlatformSetting({ singleton: 'main' });

    if (platformName !== undefined && platformName.trim()) settings.platformName = platformName.trim();
    if (supportEmail !== undefined && supportEmail.trim()) settings.supportEmail = supportEmail.trim();
    if (commissionRate !== undefined) settings.commissionRate = Number(commissionRate);
    if (commissionCustomerSharePct !== undefined) settings.commissionCustomerSharePct = Number(commissionCustomerSharePct);

    // --- Tài khoản nhận thanh toán ---
    if (bankName !== undefined) settings.bankName = bankName.trim();
    if (bankBin !== undefined) settings.bankBin = bankBin.trim();
    if (bankAccountNumber !== undefined) settings.bankAccountNumber = bankAccountNumber.trim();
    if (bankAccountName !== undefined) settings.bankAccountName = bankAccountName.trim().toUpperCase();
    if (req.body.bankTransferWindowMinutes !== undefined) {
        const w = Number(req.body.bankTransferWindowMinutes);
        if (Number.isNaN(w) || w < 5 || w > 180) {
            return res.status(400).json({ message: 'Cửa sổ chờ chuyển khoản phải từ 5 đến 180 phút' });
        }
        settings.bankTransferWindowMinutes = w;
    }

    // --- Tham số chuyển sân, huỷ đơn và kế toán ---
    for (const [field, rule] of Object.entries(NUMERIC_FIELDS)) {
        if (req.body[field] === undefined) continue;
        const v = Number(req.body[field]);
        if (Number.isNaN(v) || v < rule.min || (rule.max !== undefined && v > rule.max)) {
            return res.status(400).json({ message: `Giá trị của "${field}" không hợp lệ` });
        }
        settings[field] = v;
    }
    if (settings.transferFeeMax < settings.transferFeeMin) {
        return res.status(400).json({ message: 'Phí chuyển sân tối đa phải lớn hơn hoặc bằng phí tối thiểu' });
    }

    if (req.body.transferEnabled !== undefined) settings.transferEnabled = !!req.body.transferEnabled;
    if (req.body.commissionAutoIssueEnabled !== undefined) settings.commissionAutoIssueEnabled = !!req.body.commissionAutoIssueEnabled;
    if (req.body.commissionBlockEnabled !== undefined) settings.commissionBlockEnabled = !!req.body.commissionBlockEnabled;
    if (req.body.refundToCreditEnabled !== undefined) settings.refundToCreditEnabled = !!req.body.refundToCreditEnabled;

    if (req.body.transferFeeTiers !== undefined) {
        const err = validateTiers(req.body.transferFeeTiers, ['sameVenueRate', 'sameOwnerRate', 'crossOwnerRate'], 'Biểu phí chuyển sân');
        if (err) return res.status(400).json({ message: err });
        settings.transferFeeTiers = req.body.transferFeeTiers;
    }
    if (req.body.compensationTiers !== undefined) {
        const err = validateTiers(req.body.compensationTiers, ['rate'], 'Biểu bồi thường chủ sân');
        if (err) return res.status(400).json({ message: err });
        settings.compensationTiers = req.body.compensationTiers;
    }
    if (req.body.cancellationTiers !== undefined) {
        const err = validateTiers(req.body.cancellationTiers, ['refundRate'], 'Biểu hoàn tiền khi huỷ');
        if (err) return res.status(400).json({ message: err });
        settings.cancellationTiers = req.body.cancellationTiers;
    }

    settings.updatedBy = req.user._id;

    await settings.save();
    // Đảm bảo lượt tạo booking / tính doanh thu NGAY SAU đây đọc được giá trị
    // mới, không phải đợi cache 1 phút hết hạn.
    invalidateCache();

    res.json({ settings });
});
