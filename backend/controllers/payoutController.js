const Payout = require('../models/Payout');
const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const Notification = require('../models/Notification');
const LedgerEntry = require('../models/LedgerEntry');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ledger = require('../utils/ledger');

/**
 * CÔNG NỢ PHẢI TRẢ CHỦ SÂN.
 *
 * Doanh thu chủ sân được nhận = tổng `amount` (giá sân, KHÔNG gồm serviceFee —
 * đó là phần nền tảng giữ lại) của các đơn đã thanh toán/hoàn tất, tính từ SAU
 * lần chi trả gần nhất để không tính trùng khoản đã trả.
 *
 * ============ VÌ SAO CÓ HAI CÁCH TÍNH Ở ĐÂY ============
 *
 * Tài liệu (mục 8.4) quy định công nợ phải đọc từ SỔ CÁI. Nhưng dữ liệu cũ được
 * tạo ra trước khi có sổ cái nên không có bút toán tương ứng — nếu chuyển thẳng
 * sang đọc sổ cái, công nợ của mọi chủ sân cũ sẽ về 0 và họ bị quỵt tiền.
 *
 * Nên ở đây tính theo CẢ HAI cách rồi báo cáo song song: `owedSinceLastPayout`
 * (tính từ Booking, dùng để chi trả như trước) và `ledgerOwed` (tính từ sổ cái,
 * để đối chiếu). Khi hai con số khớp nhau trên toàn bộ chủ sân — nghĩa là dữ
 * liệu cũ đã chạy qua hết một kỳ — thì có thể bỏ nhánh Booking đi.
 *
 * Bổ sung quan trọng so với bản cũ: mỗi lần chi trả giờ ĐƯỢC GHI vào sổ cái.
 * Trước đây không ghi, nên Σ payout trong sổ cái luôn bằng 0 và mọi báo cáo
 * dựa trên sổ cái đều thổi phồng công nợ.
 */
async function calculateOwedBalance(ownerId) {
    const venues = await Venue.find({ ownerId }).select('_id');
    const venueIds = venues.map((v) => v._id);

    const lastPayout = await Payout.findOne({ ownerId }).sort({ periodEnd: -1 });
    const dateFilter = lastPayout ? { createdAt: { $gt: lastPayout.periodEnd } } : {};

    // 'transferred' PHẢI có trong danh sách: đơn bị chuyển đi vẫn sinh ra khoản
    // bồi thường cho chủ sân. Nhưng với đơn đó chỉ tính compensationAmount,
    // TUYỆT ĐỐI không tính amount — nếu tính cả hai thì chủ sân được trả tiền
    // cho một khung giờ họ không hề phục vụ.
    const bookings = await Booking.find({
        venueId: { $in: venueIds },
        status: { $in: ['confirmed', 'completed', 'transferred'] },
        ...dateFilter,
    }).select('amount compensationAmount cancellationFee status');

    let bookingRevenue = 0;
    let compensation = 0;
    let realBookings = 0;
    bookings.forEach((b) => {
        if (b.status === 'transferred') {
            compensation += b.compensationAmount || 0;
        } else {
            bookingRevenue += b.amount || 0;
            realBookings += 1;
        }
    });

    // ===== Đối chiếu từ sổ cái =====
    const ledgerRows = await LedgerEntry.aggregate([
        { $match: { ownerId: typeof ownerId === 'string' ? require('mongoose').Types.ObjectId.createFromHexString(ownerId) : ownerId } },
        { $group: { _id: '$entryType', total: { $sum: '$amount' } } },
    ]);
    const byType = Object.fromEntries(ledgerRows.map((r) => [r._id, r.total]));
    const ledgerOwed = (byType.owner_earning || 0)
        + (byType.owner_compensation || 0)
        + (byType.cancellation_fee || 0)
        - (byType.payout || 0);

    return {
        owedSinceLastPayout: bookingRevenue + compensation,
        bookingRevenue,
        compensation,
        bookingCount: realBookings,
        lastPayoutDate: lastPayout?.periodEnd || null,
        // Chỉ để đối chiếu — chưa dùng làm cơ sở chi trả cho tới khi dữ liệu cũ
        // đã đi qua hết một kỳ và hai con số hội tụ.
        ledgerOwed,
        ledgerBreakdown: byType,
    };
}

// @route   GET /api/admin/owners/:id/payouts
exports.getOwnerPayoutsAdmin = asyncHandler(async (req, res) => {
    const payouts = await Payout.find({ ownerId: req.params.id }).sort({ createdAt: -1 });
    const balance = await calculateOwedBalance(req.params.id);
    res.json({ payouts, balance });
});

// @route   POST /api/admin/owners/:id/payouts
exports.createPayoutAdmin = asyncHandler(async (req, res) => {
    const { amount, note } = req.body;
    const amt = Math.round(Number(amount));
    if (Number.isNaN(amt) || amt <= 0) {
        return res.status(400).json({ message: 'Số tiền thanh toán phải lớn hơn 0' });
    }

    // TRƯỚC ĐÂY: không có gì ngăn admin chi tiền ngay sau khi chủ sân vừa đổi
    // số tài khoản — nếu đó là một phiên đăng nhập bị chiếm đoạt, tiền sẽ
    // chuyển thẳng cho kẻ gian. Bắt buộc xác minh trước khi được ghi nhận chi.
    const owner = await User.findById(req.params.id).select('bankInfoPendingReview name bankName bankAccount');
    if (!owner) return res.status(404).json({ message: 'Không tìm thấy chủ sân này' });
    if (owner.bankInfoPendingReview) {
        return res.status(409).json({
            message: `Chủ sân "${owner.name}" vừa đổi thông tin ngân hàng, chưa được xác minh. `
                + 'Vui lòng gọi điện xác minh với chủ sân rồi bấm "Xác nhận đã kiểm tra" trước khi chi trả.',
        });
    }

    const balance = await calculateOwedBalance(req.params.id);
    // Chặn chi vượt công nợ. Trước đây quản trị viên gõ nhầm một số 0 là ghi
    // nhận thẳng, và kỳ sau công nợ bị âm mà không có cách nào sửa ngoài việc
    // xoá tay trong cơ sở dữ liệu.
    if (amt > balance.owedSinceLastPayout) {
        return res.status(400).json({
            message: `Số tiền vượt quá công nợ hiện tại (${balance.owedSinceLastPayout.toLocaleString('vi-VN')}đ). `
                + 'Nếu đây là khoản điều chỉnh đặc biệt, hãy ghi rõ trong ghi chú và chia thành nhiều lần.',
            owed: balance.owedSinceLastPayout,
        });
    }

    const payout = await Payout.create({
        ownerId: req.params.id,
        amount: amt,
        note: note?.trim() || '',
        periodEnd: new Date(),
        createdBy: req.user._id,
    });

    // Ghi vào sổ cái. Thiếu bút toán này thì Σ payout luôn bằng 0 và công nợ
    // tính từ sổ cái sẽ phình lên mãi dù tiền đã trả xong.
    await ledger.record({
        entryType: 'payout', direction: 'platform_out', amount: amt,
        ownerId: req.params.id, payoutId: payout._id,
        createdBy: req.user._id,
        note: note?.trim() || 'Chi trả doanh thu cho chủ sân',
    }).catch((e) => console.error('ledger payout:', e.message));

    await Notification.create({
        userId: req.params.id,
        type: 'payout',
        icon: '💵',
        title: 'Bạn đã nhận được thanh toán từ nền tảng',
        message: `Quản trị viên đã ghi nhận thanh toán ${amt.toLocaleString('vi-VN')}đ cho doanh thu chủ sân của bạn.${note ? ` Ghi chú: ${note.trim()}` : ''}`,
        link: '/owner/revenue',
    });

    res.status(201).json({ payout });
});

// @route   GET /api/owner/payouts
exports.getMyPayouts = asyncHandler(async (req, res) => {
    const payouts = await Payout.find({ ownerId: req.user._id }).sort({ createdAt: -1 });
    const balance = await calculateOwedBalance(req.user._id);
    res.json({ payouts, balance });
});

module.exports.calculateOwedBalance = calculateOwedBalance;
