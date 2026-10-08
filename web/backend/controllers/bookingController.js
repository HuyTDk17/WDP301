const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const Court = require('../models/Court');
const Hold = require('../models/Hold');
const asyncHandler = require('../utils/asyncHandler');
const { getCommissionRate, getCommissionConfig, getSettings } = require('../utils/platformSettings');
const { splitCommission } = require('../utils/commission');
const courtRules = require('../utils/courtRules');
const escapeRegex = require('../utils/escapeRegex');
const { calculateAmount, durationHours, leadTimeHours, isValidDateString, isValidTimeString } = require('../utils/timeSlots');
const { cancellationRefundRate } = require('../utils/transferPolicy');
const slotLock = require('../utils/slotLock');
const ledger = require('../utils/ledger');
const credit = require('../utils/credit');
const Payment = require('../models/Payment');
const { voidOpenForBooking } = require('../utils/openPayments');
const settlementService = require('../services/settlementService');
const Notification = require('../models/Notification');

const HOLD_DURATION_MINUTES = 10;
// Cửa sổ mặc định — dùng khi chưa tải được cấu hình từ CSDL (ví dụ lỗi tạm
// thời). Giá trị thật lấy từ settings.bankTransferWindowMinutes, có thể chỉnh
// trong trang Cài đặt. Chuyển khoản ngân hàng cần nhiều thời gian hơn quẹt thẻ
// qua cổng thanh toán (mở app, chọn tài khoản, nhập nội dung), nên mặc định
// rộng hơn hẳn con số 15 phút hồi còn dùng VNPay/MoMo.
const DEFAULT_PAYMENT_WINDOW_MINUTES = 30;

async function isSlotTaken(courtId, date, startTime, endTime, excludeUserId = null) {
    const settings = await getSettings();
    const windowMinutes = settings.bankTransferWindowMinutes || DEFAULT_PAYMENT_WINDOW_MINUTES;
    const staleBefore = new Date(Date.now() - windowMinutes * 60 * 1000);

    const bookingConflict = await Booking.findOne({
        courtId, date,
        // Loại trừ đơn đã huỷ, đơn đã chuyển đi, và đơn chờ thanh toán quá hạn —
        // nếu không, một đơn kẹt ở 'awaiting_payment' sẽ chiếm khung giờ vĩnh viễn.
        status: { $nin: ['cancelled', 'transferred'] },
        startTime: { $lt: endTime }, endTime: { $gt: startTime },
        $nor: [{ status: 'awaiting_payment', createdAt: { $lt: staleBefore } }],
    });
    if (bookingConflict) return true;

    if (await slotLock.isTaken({ courtId, date, startTime, endTime })) return true;

    // So sánh CHỒNG LẤN chứ không so khớp startTime chính xác, để bắt được
    // trường hợp 19:00–20:30 với 20:00–21:00.
    const holdFilter = {
        courtId, date, consumed: false, expiresAt: { $gt: new Date() },
        startTime: { $lt: endTime }, endTime: { $gt: startTime },
    };
    if (excludeUserId) holdFilter.userId = { $ne: excludeUserId };

    return !!(await Hold.findOne(holdFilter));
}

// ============================================================
// API CHO KHÁCH HÀNG
// ============================================================

// @route   POST /api/bookings/hold
exports.holdSlot = asyncHandler(async (req, res) => {
    const { venueId, courtId, date, startTime, endTime } = req.body;
    if (!venueId || !courtId || !date || !startTime || !endTime) {
        return res.status(400).json({ message: 'Thiếu thông tin để giữ chỗ' });
    }
    // Chặn định dạng SAI ngay từ đầu — nếu không, date/startTime/endTime không
    // hợp lệ khiến leadTimeHours() trả về NaN, và NaN <= 0 luôn là false, nên
    // điều kiện "không cho đặt vào quá khứ" bên dưới sẽ bị lách qua mà không
    // ai hay biết. Xem giải thích đầy đủ trong utils/timeSlots.js.
    if (!isValidDateString(date) || !isValidTimeString(startTime) || !isValidTimeString(endTime)) {
        return res.status(400).json({ message: 'Ngày hoặc khung giờ không đúng định dạng' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    // Không cho giữ chỗ ở địa điểm chưa duyệt hoặc đang tạm ngưng — trước đây
    // chỉ kiểm tra sân con, nên một địa điểm bị quản trị viên gỡ xuống vẫn nhận
    // được đơn mới nếu khách còn giữ đường dẫn cũ.
    if (venue.status !== 'approved' || !venue.isActive) {
        return res.status(409).json({ message: 'Địa điểm này hiện không nhận đặt sân' });
    }
    // Chủ sân quá hạn nộp hoa hồng → tạm ngưng nhận đặt MỚI. Không nêu lý do với khách.
    if (await settlementService.isOwnerBlocked(venue.ownerId)) {
        return res.status(409).json({ message: 'Địa điểm này tạm thời chưa nhận đặt mới. Vui lòng chọn địa điểm khác hoặc thử lại sau.' });
    }
    const court = await Court.findById(courtId);
    if (!court) return res.status(404).json({ message: 'Không tìm thấy sân này' });
    if (String(court.venueId) !== String(venue._id)) {
        return res.status(400).json({ message: 'Sân không thuộc địa điểm đã chọn' });
    }
    if (court.status !== 'active') return res.status(409).json({ message: 'Sân này hiện không hoạt động' });

    if (durationHours(startTime, endTime) <= 0) {
        return res.status(400).json({ message: 'Khung giờ không hợp lệ' });
    }
    // Không cho đặt vào quá khứ.
    if (leadTimeHours(date, startTime) <= 0) {
        return res.status(400).json({ message: 'Khung giờ này đã trôi qua, vui lòng chọn giờ khác' });
    }

    const taken = await isSlotTaken(courtId, date, startTime, endTime, req.user._id);
    if (taken) {
        return res.status(409).json({ message: 'Khung giờ này vừa có người đặt hoặc đang được giữ chỗ, vui lòng chọn giờ khác' });
    }

    const expiresAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60 * 1000);
    const hold = await Hold.create({ userId: req.user._id, venueId, courtId, date, startTime, endTime, expiresAt });

    res.status(201).json({ hold: { holdId: hold._id, expiresAt: hold.expiresAt } });
});

// @route   POST /api/bookings
exports.createBooking = asyncHandler(async (req, res) => {
    const { holdId, notes } = req.body; // môn KHÔNG lấy từ client — suy ra từ sân (courtRules)
    if (!holdId) return res.status(400).json({ message: 'Thiếu thông tin giữ chỗ' });

    const hold = await Hold.findById(holdId);
    if (!hold) return res.status(410).json({ message: 'Lượt giữ chỗ đã hết hạn hoặc không tồn tại, vui lòng chọn lại khung giờ' });
    if (hold.userId.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Lượt giữ chỗ này không thuộc về bạn' });
    if (hold.consumed) return res.status(409).json({ message: 'Lượt giữ chỗ này đã được sử dụng' });
    if (hold.expiresAt < new Date()) return res.status(410).json({ message: 'Lượt giữ chỗ đã hết hạn, vui lòng chọn lại khung giờ' });

    const venue = await Venue.findById(hold.venueId);
    const court = await Court.findById(hold.courtId);
    if (!venue || !court) return res.status(404).json({ message: 'Địa điểm hoặc sân không còn tồn tại' });
    if (await settlementService.isOwnerBlocked(venue.ownerId)) {
        return res.status(409).json({ message: 'Địa điểm này tạm thời chưa nhận đặt mới. Vui lòng chọn địa điểm khác hoặc thử lại sau.' });
    }

    // Giá = đơn giá theo giờ × SỐ GIỜ.
    const amount = calculateAmount(court.pricePerHour, hold.startTime, hold.endTime);
    if (amount <= 0) return res.status(400).json({ message: 'Khung giờ không hợp lệ' });
    // Hoa hồng nền tảng = giá sân × tỉ lệ, chia giữa khách (serviceFee) và chủ sân
    // (ownerCommission) theo cấu hình — mặc định chủ sân chịu toàn bộ.
    const { ratePct, customerSharePct } = await getCommissionConfig();
    const fee = splitCommission({ amount, ratePct, customerSharePct });
    const serviceFee = fee.serviceFee;

    // Không còn mã khuyến mãi do nền tảng cấp: giá khách trả = giá sân + phần phí dịch vụ khách chịu.
    const discountAmount = 0;

    const booking = await Booking.create({
        customerId: req.user._id,
        venueId: hold.venueId, courtId: hold.courtId,
        venueName: venue.name, courtName: court.name,
        date: hold.date, startTime: hold.startTime, endTime: hold.endTime,
        duration: durationHours(hold.startTime, hold.endTime),
        sport: courtRules.sportOf(court), notes, amount, serviceFee,
        ownerCommission: fee.ownerCommission, commissionRate: ratePct,
        promoCode: '', discountAmount,
        status: 'awaiting_payment',
    });

    // LƯU Ý: usedCount KHÔNG được tăng ở đây. Trước đây lượt dùng bị trừ ngay
    // khi tạo đơn nhưng không bao giờ hoàn lại khi khách bỏ dở — một mã giới
    // hạn 100 lượt có thể bị "đốt" sạch mà không tạo ra đồng doanh thu nào.
    // Giờ chỉ trừ khi thanh toán THÀNH CÔNG (paymentController).

    hold.consumed = true;
    await hold.save();

    // Trả kèm số dư khuyến mãi để trang thanh toán hiển thị
    // được ngay mà không phải gọi thêm API nào nữa.
    const creditBalance = await credit.balanceOf(req.user._id);
    const gross = amount + serviceFee - discountAmount;

    res.status(201).json({
        booking,
        creditBalance,
        creditApplicable: Math.min(creditBalance, gross),
    });
});

exports.getMyBookings = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = { customerId: req.user._id };
    if (status) filter.status = status;
    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    res.json({ bookings, total: bookings.length });
});

exports.getBookingById = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });

    // Không kiểm tra ở đây thì bất kỳ khách hàng nào đã đăng nhập cũng đọc được
    // đơn của người khác nếu biết mã định danh (lỗ hổng IDOR).
    if (String(booking.customerId || '') !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn không có quyền xem lượt đặt này' });
    }
    res.json({ booking });
});

/**
 * Xem trước chính sách huỷ TRƯỚC khi khách bấm huỷ — để khách biết mất bao
 * nhiêu, và để thấy rằng chuyển sân thường rẻ hơn huỷ.
 * @route GET /api/bookings/:id/cancel-preview
 */
exports.previewCancellation = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    if (String(booking.customerId || '') !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn không có quyền với lượt đặt này' });
    }
    res.json(await computeCancellation(booking));
});

/**
 * Tính toán khi huỷ.
 *
 * Nguyên tắc: phí dịch vụ là phí cho công việc trung gian ĐÃ làm (tìm sân, giữ
 * chỗ, xử lý thanh toán) nên KHÔNG hoàn khi lỗi thuộc về phía khách. Phần giá
 * sân được chia giữa khách và chủ sân theo thời gian báo huỷ.
 *
 * Khoản hoàn được tách HAI chiều: TIỀN MẶT và SỐ DƯ khuyến mãi.
 * Khách trả bằng gì thì hoàn về đúng thứ đó — nếu không, một người có thể nạp
 * số dư vào đơn rồi huỷ ngay để rút ra tiền mặt.
 */
async function computeCancellation(booking) {
    const settings = await getSettings();
    const L = leadTimeHours(booking.date, booking.startTime);
    const refundRate = cancellationRefundRate(settings, L);

    const paid = booking.amount + (booking.serviceFee || 0) - (booking.discountAmount || 0);
    const refundAmount = Math.round(booking.amount * refundRate);
    const ownerKeeps = booking.amount - refundAmount;
    const platformKeeps = (booking.serviceFee || 0) - (booking.discountAmount || 0);

    const split = credit.splitRefund(refundAmount, booking.creditApplied || 0, paid);

    return {
        leadTimeHours: Math.round(L * 100) / 100,
        refundRate,
        paid,
        creditApplied: booking.creditApplied || 0,
        refundAmount,
        refundCash: split.cash,
        refundCredit: split.credit,
        ownerKeeps,
        platformKeeps,
        cancellationFee: paid - refundAmount,
        // Đơn chưa thanh toán thì không có gì để hoàn
        refundable: booking.status === 'confirmed',
    };
}

exports.cancelBooking = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    if (!booking.customerId || booking.customerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền hủy lượt đặt này' });
    }
    if (['cancelled', 'completed', 'transferred', 'no_show'].includes(booking.status)) {
        return res.status(409).json({ message: 'Lượt đặt này không thể hủy ở trạng thái hiện tại' });
    }

    const wasAwaitingPayment = booking.status === 'awaiting_payment';

    // Khách đã báo "đã chuyển khoản" thì tiền có thể đã nằm trong tài khoản chủ
    // sân. Cho huỷ lúc này sẽ để lại một khoản tiền thật không gắn với lượt đặt
    // nào (và chưa có đường hoàn) — phải chờ chủ sân xác nhận hoặc từ chối trước.
    if (wasAwaitingPayment) {
        const reported = await Payment.exists({ bookingId: booking._id, purpose: 'booking', status: 'awaiting_confirmation' });
        if (reported) {
            return res.status(409).json({
                message: 'Bạn đã báo chuyển khoản cho lượt đặt này nên chưa thể huỷ. '
                    + 'Vui lòng chờ chủ sân xác nhận, hoặc liên hệ chủ sân nếu chuyển nhầm.',
            });
        }
    }

    const calc = await computeCancellation(booking);

    booking.status = 'cancelled';
    booking.cancellationReason = req.body.reason || '';

    // ===== Đơn CHƯA thanh toán =====
    // Phần số dư đang được giữ chỗ phải trả lại nguyên vẹn: khách chưa
    // tiêu gì, không có lý do gì giữ tiền của họ.
    if (wasAwaitingPayment) {
        if (booking.creditApplied > 0) {
            await credit.release(booking.customerId, booking.creditApplied, {
                bookingId: booking._id,
                note: 'Hoàn lại số dư do khách huỷ đơn trước khi thanh toán',
            }).catch((e) => console.error('credit.release:', e.message));
            booking.creditApplied = 0;
        }
        await booking.save();
        await slotLock.release(booking._id).catch(() => {});
        // Đóng giao dịch chuyển khoản còn treo — nếu không chủ sân vẫn thấy một
        // giao dịch của đơn đã huỷ.
        await voidOpenForBooking(booking._id, 'Khách huỷ đơn trước khi thanh toán').catch(() => {});
        return res.json({ booking, cancellation: { ...calc, refundable: false } });
    }

    // ===== Đơn ĐÃ thanh toán =====
    if (calc.refundable) {
        booking.refundAmount = calc.refundCash;
        booking.refundCreditAmount = calc.refundCredit;
        booking.cancellationFee = calc.cancellationFee;
    }
    await booking.save();

    // Trả khung giờ về trạng thái trống ngay lập tức để chủ sân còn bán lại
    await slotLock.release(booking._id).catch(() => {});

    // Phần hoàn bằng TIỀN MẶT: tạo yêu cầu hoàn để CHỦ SÂN chuyển khoản
    // lại cho khách — chuyển khoản ngân hàng không có API hoàn tự động.
    if (calc.refundCash > 0) {
        await require('../services/refundService').createRefund({
            amount: calc.refundCash,
            reason: 'Hoàn tiền huỷ đơn theo chính sách',
            bookingId: booking._id,
            customerId: booking.customerId,
            prefix: 'CR',
        }).catch((e) => console.error('refund:', e.message));
    }

    // Phần hoàn về SỐ DƯ: cộng lại ngay, dùng được cho đơn sau.
    if (calc.refundCredit > 0) {
        await credit.refund(booking.customerId, calc.refundCredit, {
            bookingId: booking._id,
            note: 'Hoàn phần đã thanh toán bằng số dư khi huỷ đơn',
        }).catch((e) => console.error('credit.refund:', e.message));
        await ledger.record({
            entryType: 'credit_issued', direction: 'platform_out', amount: calc.refundCredit,
            bookingId: booking._id, customerId: booking.customerId,
            note: 'Hoàn số dư khuyến mãi khi huỷ đơn',
        }).catch(() => {});
    }

    if (calc.ownerKeeps > 0) {
        const venue = await Venue.findById(booking.venueId).select('ownerId');
        await ledger.record({
            entryType: 'cancellation_fee', direction: 'platform_out', amount: calc.ownerKeeps,
            bookingId: booking._id, ownerId: venue?.ownerId,
            note: 'Phần chủ sân giữ lại khi khách huỷ sát giờ',
        }).catch(() => {});
        await Notification.create({
            userId: venue?.ownerId, type: 'booking', icon: '🚫',
            title: 'Một lượt đặt đã bị huỷ',
            message: `Lượt đặt ngày ${booking.date} lúc ${booking.startTime} tại "${booking.venueName}" đã bị khách huỷ. Bạn giữ lại ${calc.ownerKeeps.toLocaleString('vi-VN')}đ theo chính sách huỷ.`,
            link: '/owner/bookings',
        }).catch(() => {});
    }

    res.json({ booking, cancellation: calc });
});

exports.getBookingStats = asyncHandler(async (req, res) => {
    const bookings = await Booking.find({ customerId: req.user._id });
    res.json({
        total: bookings.length,
        completed: bookings.filter((b) => b.status === 'completed').length,
        upcoming: bookings.filter((b) => ['confirmed', 'awaiting_payment'].includes(b.status)).length,
        creditBalance: await credit.balanceOf(req.user._id),
    });
});

// ============================================================
// API CHO CHỦ SÂN
// ============================================================

exports.getOwnerBookings = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const venues = await Venue.find({ ownerId: req.user._id }).select('_id');
    const venueIds = venues.map((v) => v._id);
    const filter = { venueId: { $in: venueIds } };
    if (status) filter.status = status;
    const bookings = await Booking.find(filter).populate('customerId', 'name phone avatar').sort({ createdAt: -1 });
    res.json({ bookings, total: bookings.length });
});

// Máy trạng thái của đơn. Trước đây chủ sân đặt được BẤT KỲ giá trị nào, kể cả
// nhảy thẳng từ 'awaiting_payment' sang 'completed' để làm phồng công nợ.
const ALLOWED_STATUS_TRANSITIONS = {
    awaiting_payment: ['cancelled'],
    pending: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled', 'no_show'],
    completed: [],
    cancelled: [],
    no_show: [],
    transferred: [],
};

exports.updateBookingStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    const venue = await Venue.findById(booking.venueId);
    if (!venue || venue.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền với lượt đặt này' });
    }

    const allowed = ALLOWED_STATUS_TRANSITIONS[booking.status] || [];
    if (!allowed.includes(status)) {
        return res.status(400).json({
            message: allowed.length
                ? `Không thể chuyển từ trạng thái hiện tại sang "${status}"`
                : 'Lượt đặt này đã ở trạng thái cuối, không thể thay đổi',
        });
    }

    // Chủ sân chủ động huỷ một đơn ĐÃ thanh toán thì theo chính sách ở mục 8.6,
    // khách được hoàn 100% kể cả phí dịch vụ — lỗi không thuộc về khách.
    const isOwnerCancellingPaid = status === 'cancelled' && booking.status === 'confirmed';

    booking.status = status;
    await booking.save();

    // Huỷ hoặc không đến thì khung giờ được trả lại ngay
    if (['cancelled', 'no_show'].includes(status)) {
        await slotLock.release(booking._id).catch(() => {});
    }

    if (isOwnerCancellingPaid && booking.customerId) {
        const paid = booking.amount + (booking.serviceFee || 0) - (booking.discountAmount || 0);
        const split = credit.splitRefund(paid, booking.creditApplied || 0, paid);

        if (split.cash > 0) {
            await require('../services/refundService').createRefund({
                amount: split.cash,
                reason: 'Chủ sân huỷ đơn — hoàn 100% cho khách',
                bookingId: booking._id,
                customerId: booking.customerId,
                prefix: 'OC',
            }).catch((e) => console.error('refund:', e.message));
        }
        if (split.credit > 0) {
            await credit.refund(booking.customerId, split.credit, {
                bookingId: booking._id,
                note: 'Chủ sân huỷ đơn — hoàn phần đã trả bằng số dư',
            }).catch(() => {});
        }

        await Notification.create({
            userId: booking.customerId, type: 'booking', icon: '⚠️',
            title: 'Chủ sân đã huỷ lượt đặt của bạn',
            message: `Lượt đặt ngày ${booking.date} lúc ${booking.startTime} tại "${booking.venueName}" đã bị chủ sân huỷ. `
                + `Toàn bộ ${paid.toLocaleString('vi-VN')}đ sẽ được hoàn lại cho bạn.`,
            link: '/bookings',
        }).catch(() => {});
    }

    res.json({ booking });
});

// @route   POST /api/owner/bookings/manual
exports.createManualBooking = asyncHandler(async (req, res) => {
    const { venueId, courtId, date, startTime, endTime, customerName, phone } = req.body;
    if (!venueId || !courtId || !date || !startTime || !endTime || !customerName) {
        return res.status(400).json({ message: 'Thiếu thông tin để tạo lượt đặt' });
    }
    if (!isValidDateString(date) || !isValidTimeString(startTime) || !isValidTimeString(endTime)) {
        return res.status(400).json({ message: 'Ngày hoặc khung giờ không đúng định dạng' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    if (venue.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền với địa điểm này' });
    }
    const court = await Court.findById(courtId);
    if (!court || String(court.venueId) !== String(venue._id)) return res.status(404).json({ message: 'Không tìm thấy sân này' });
    if (durationHours(startTime, endTime) <= 0) {
        return res.status(400).json({ message: 'Khung giờ không hợp lệ' });
    }

    const taken = await isSlotTaken(courtId, date, startTime, endTime);
    if (taken) return res.status(409).json({ message: 'Khung giờ này đã có người đặt hoặc đang được giữ chỗ' });

    const booking = await Booking.create({
        customerId: null, guestName: customerName, guestPhone: phone || '',
        venueId, courtId, venueName: venue.name, courtName: court.name,
        date, startTime, endTime,
        sport: courtRules.sportOf(court),
        duration: durationHours(startTime, endTime),
        amount: calculateAmount(court.pricePerHour, startTime, endTime), serviceFee: 0,
        status: 'confirmed', paymentMethod: 'manual',
    });

    // Đơn thủ công cũng phải khoá khung giờ, nếu không khách online vẫn đặt
    // chồng lên được.
    const got = await slotLock.acquire({ courtId, date, startTime, endTime, bookingId: booking._id });
    if (!got) {
        await booking.deleteOne();
        return res.status(409).json({ message: 'Khung giờ này vừa có người đặt mất' });
    }

    // Đơn thủ công = chủ sân tự thu tiền tại quầy, ngoài hệ thống: nền tảng không giữ và
    // không nợ đồng nào, nên KHÔNG ghi sổ cái và KHÔNG tính vào đối soát hoa hồng
    // (utils/settlementMath.js bỏ qua paymentMethod 'manual'). Trước đây đơn này bị ghi là
    // "nền tảng nợ chủ sân" — admin có thể trả tiền cho một khoản chủ sân đã tự thu.

    res.status(201).json({ booking });
});

// ============================================================
// API CHO QUẢN TRỊ VIÊN
// ============================================================

/**
 * @route GET /api/admin/commissions?search=&month=YYYY-MM&page=&limit=
 *
 * Báo cáo CHỈ ĐỌC: hoa hồng nền tảng thu được trên từng lượt đặt. Cố ý KHÔNG trả
 * thông tin khách (tên, SĐT) hay trạng thái thanh toán — quản trị viên chỉ cần biết
 * "đơn nào, của chủ sân nào, hoa hồng bao nhiêu", không dính vào quan hệ khách–chủ sân.
 * Đơn đã chuyển đi ('transferred') và đơn chưa thanh toán/đã huỷ không sinh hoa hồng.
 */
exports.getCommissionReport = asyncHandler(async (req, res) => {
    const { search = '', month = '', page = 1, limit = 15 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));

    const match = { status: { $in: ['confirmed', 'completed', 'no_show'] }, paymentMethod: { $ne: 'manual' } };
    if (/^\d{4}-\d{2}$/.test(month)) match.date = new RegExp(`^${month}`);

    const pipeline = [
        { $match: match },
        { $lookup: { from: 'venues', localField: 'venueId', foreignField: '_id', as: 'venue' } },
        { $unwind: { path: '$venue', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'users', localField: 'venue.ownerId', foreignField: '_id', as: 'owner' } },
        { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                venueName: 1, courtName: 1, date: 1, startTime: 1, endTime: 1, status: 1,
                amount: 1, commissionRate: 1, serviceFee: 1, ownerCommission: 1, discountAmount: 1,
                commission: { $add: [{ $ifNull: ['$serviceFee', 0] }, { $ifNull: ['$ownerCommission', 0] }] },
                ownerId: '$owner._id', ownerName: '$owner.name',
            },
        },
    ];
    if (search.trim()) {
        const re = new RegExp(escapeRegex(search.trim()), 'i');
        pipeline.push({ $match: { $or: [{ venueName: re }, { ownerName: re }] } });
    }
    pipeline.push({ $sort: { date: -1, startTime: -1 } });
    pipeline.push({
        $facet: {
            data: [{ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }],
            totals: [{ $group: { _id: null, count: { $sum: 1 }, gmv: { $sum: '$amount' }, commission: { $sum: '$commission' } } }],
        },
    });

    const [result] = await Booking.aggregate(pipeline);
    const totals = result.totals[0] || { count: 0, gmv: 0, commission: 0 };
    res.json({
        bookings: result.data,
        total: totals.count,
        summary: { bookings: totals.count, gmv: totals.gmv, commission: totals.commission },
        page: pageNum,
        totalPages: Math.max(1, Math.ceil(totals.count / limitNum)),
    });
});
