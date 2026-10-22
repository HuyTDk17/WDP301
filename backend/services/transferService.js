const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const Court = require('../models/Court');
const Hold = require('../models/Hold');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const TransferRequest = require('../models/TransferRequest');
const CreditTransaction = require('../models/CreditTransaction');

const { getSettings, getCommissionConfig } = require('../utils/platformSettings');
const courtRules = require('../utils/courtRules');
const { splitCommission } = require('../utils/commission');
const { calculateAmount, leadTimeHours, durationHours, isValidDateString, isValidTimeString } = require('../utils/timeSlots');
const { resolveTransferType, buildPolicy, requiresOwnerApproval } = require('../utils/transferPolicy');
const transferMessages = require('../utils/transferMessages');
const { quoteTransfer, verifyBalance, buildBreakdown } = require('../utils/transferPricing');
const { validateAndCalculateDiscount } = require('../controllers/promotionController');
const slotLock = require('../utils/slotLock');
const ledger = require('../utils/ledger');
const withTransaction = require('../utils/withTransaction');
const refundService = require('./refundService');

/** Lỗi nghiệp vụ có kèm mã HTTP — errorHandler sẽ đọc statusCode. */
function fail(status, message) {
    const err = new Error(message);
    err.statusCode = status;
    throw err;
}

// ============================================================
// 1. KIỂM TRA ĐIỀU KIỆN CHUYỂN (BR-TR-01 .. BR-TR-07)
// ============================================================

/**
 * Trả về { eligible, reasons[], leadTimeHours, policy } cho một đơn.
 * Không ném lỗi — dùng cho giao diện hiển thị nút "Chuyển sân" mờ kèm lý do.
 */
async function checkEligibility(booking, settings) {
    const reasons = [];
    const L = leadTimeHours(booking.date, booking.startTime);

    if (!settings.transferEnabled) reasons.push('Chức năng chuyển sân đang tạm ngưng');
    // BR-TR-01: chưa thanh toán thì không có gì để quyết toán; đã dùng thì
    // không còn hàng hoá để chuyển.
    if (booking.status !== 'confirmed') {
        reasons.push(booking.status === 'awaiting_payment'
            ? 'Vui lòng hoàn tất thanh toán trước khi chuyển sân'
            : 'Chỉ lượt đặt đã xác nhận mới chuyển được');
    }
    // BR-TR-03: đơn thủ công không có tài khoản để quyết toán tiền
    if (!booking.customerId) reasons.push('Lượt đặt thủ công không hỗ trợ chuyển sân');
    // BR-TR-04
    const minLead = settings.transferMinLeadTimeHours ?? 2;
    if (L < minLead) {
        reasons.push(L < 0
            ? 'Khung giờ đã trôi qua'
            : `Chỉ chuyển được trước giờ đá ít nhất ${minLead} tiếng`);
    }
    // BR-TR-06
    const maxTransfers = settings.maxTransfersPerBooking ?? 1;
    if ((booking.transferCount || 0) >= maxTransfers) {
        reasons.push(`Mỗi lượt đặt chỉ được chuyển tối đa ${maxTransfers} lần`);
    }

    return {
        eligible: reasons.length === 0,
        reasons,
        leadTimeHours: Math.round(L * 100) / 100,
        minLeadTimeHours: minLead,
        remainingTransfers: Math.max(0, maxTransfers - (booking.transferCount || 0)),
    };
}

// ============================================================
// 2. TẠO BÁO GIÁ
// ============================================================

async function createQuote({ booking, target, user }) {
    const settings = await getSettings();

    const eligibility = await checkEligibility(booking, settings);
    if (!eligibility.eligible) fail(422, eligibility.reasons[0]);

    // Hạn mức theo tháng của mỗi khách (Admin đặt; 0 = không giới hạn)
    const monthly = await require('../utils/transferLimits').monthlyStatus(booking.customerId, settings);
    if (monthly.reached) {
        fail(422, `Bạn đã dùng hết ${monthly.limit} lượt đổi lịch/chuyển sân trong tháng này. Lượt mới sẽ mở lại từ đầu tháng sau.`);
    }

    const { toVenueId, toCourtId, toDate, toStartTime, toEndTime } = target;
    if (!toVenueId || !toCourtId || !toDate || !toStartTime || !toEndTime) {
        fail(400, 'Thiếu thông tin sân hoặc khung giờ muốn chuyển đến');
    }
    // Cùng lý do như bookingController.holdSlot: định dạng sai khiến
    // leadTimeHours() trả NaN, và điều kiện "phải còn đủ N tiếng chuẩn bị"
    // bên dưới sẽ bị lách qua vì NaN < minLead luôn là false.
    if (!isValidDateString(toDate) || !isValidTimeString(toStartTime) || !isValidTimeString(toEndTime)) {
        fail(400, 'Ngày hoặc khung giờ muốn chuyển đến không đúng định dạng');
    }
    if (durationHours(toStartTime, toEndTime) <= 0) fail(400, 'Khung giờ đến không hợp lệ');
    // Đổi lịch và chuyển sân đều GIỮ NGUYÊN độ dài lượt đặt (không đổi 2 giờ thành 1 giờ để lách phí/giá).
    if (Math.abs(durationHours(toStartTime, toEndTime) - durationHours(booking.startTime, booking.endTime)) > 1e-9) {
        fail(400, `Khung giờ mới phải giữ nguyên độ dài lượt đặt hiện tại (${durationHours(booking.startTime, booking.endTime)} giờ)`);
    }

    // BR-TR-07: không chuyển vào sân bảo trì hoặc địa điểm bị tạm ngưng
    const [toVenue, toCourt] = await Promise.all([Venue.findById(toVenueId), Court.findById(toCourtId)]);
    if (!toVenue || !toCourt) fail(404, 'Không tìm thấy địa điểm hoặc sân muốn chuyển đến');
    if (String(toCourt.venueId) !== String(toVenue._id)) fail(400, 'Sân không thuộc địa điểm đã chọn');
    if (toCourt.status !== 'active') fail(409, 'Sân này hiện không hoạt động');
    if (toVenue.status !== 'approved' || !toVenue.isActive) fail(409, 'Địa điểm này hiện không nhận đặt sân');
    if (await require('./settlementService').isOwnerBlocked(toVenue.ownerId)) fail(409, 'Địa điểm này tạm thời chưa nhận đặt mới');

    // BR-TR-05: khung giờ đích cũng phải còn đủ thời gian chuẩn bị
    const minLead = settings.transferMinLeadTimeHours ?? 2;
    if (leadTimeHours(toDate, toStartTime) < minLead) {
        fail(400, `Khung giờ mới phải bắt đầu sau ít nhất ${minLead} tiếng nữa`);
    }

    // Chuyển về đúng chỗ cũ thì không có gì để làm
    const sameSlot = String(toCourtId) === String(booking.courtId)
        && toDate === booking.date && toStartTime === booking.startTime && toEndTime === booking.endTime;
    if (sameSlot) fail(400, 'Khung giờ mới trùng với khung giờ hiện tại');

    // BR-TR-08: kiểm tra trống ở bước báo giá (sẽ kiểm tra LẠI lúc thực thi)
    const taken = await isTargetTaken({ courtId: toCourtId, date: toDate, startTime: toStartTime, endTime: toEndTime, excludeBookingId: booking._id, userId: user._id });
    if (taken) fail(409, 'Khung giờ này vừa có người đặt hoặc đang được giữ chỗ');

    // --- Xác định loại chuyển ---
    const fromVenue = await Venue.findById(booking.venueId);
    const type = resolveTransferType({
        fromVenueId: booking.venueId, fromCourtId: booking.courtId,
        fromOwnerId: fromVenue?.ownerId, toVenueId: toVenue._id,
        toCourtId: toCourt._id, toOwnerId: toVenue.ownerId,
    });
    // Mạng lưới chuyển sân: chuyển sang CHỦ SÂN KHÁC (T4) chỉ khi cả hai chủ sân là thành viên (nếu Admin bật yêu cầu này)
    const networkBlock = await require('../utils/transferNetwork').crossOwnerBlocker({
        type, fromOwnerId: fromVenue?.ownerId, toOwnerId: toVenue.ownerId, settings,
    });
    if (networkBlock) fail(403, networkBlock);

    // --- Tính giá đơn mới (luôn tính lại ở máy chủ, không tin client) ---
    const { ratePct, customerSharePct } = await getCommissionConfig();
    const rate = ratePct / 100;
    const newAmount = calculateAmount(toCourt.pricePerHour, toStartTime, toEndTime);
    // Hoa hồng đơn mới chia giữa khách và chủ sân đích theo cấu hình hiện hành.
    const newFee = splitCommission({ amount: newAmount, ratePct, customerSharePct });
    const newServiceFee = newFee.serviceFee;

    // BR-TR-11: mã khuyến mãi KHÔNG tự động theo sang đơn mới. Chỉ áp lại nếu
    // vẫn còn hiệu lực VÀ đơn mới vẫn đủ điều kiện — tránh mã "đơn tối thiểu
    // 300k" được dùng cho đơn 150k sau khi chuyển.
    let newDiscount = 0;
    if (booking.promoCode) {
        const re = await validateAndCalculateDiscount(booking.promoCode, newAmount, newFee.total);
        if (re.valid) newDiscount = re.discount;
    }

    const L = leadTimeHours(booking.date, booking.startTime);
    const policy = buildPolicy(settings, type, L);
    const quote = quoteTransfer({
        oldAmount: booking.amount,
        oldServiceFee: booking.serviceFee,
        oldDiscount: booking.discountAmount,
        newAmount, newServiceFee, newDiscount,
    }, policy);
    quote.commissionRate = rate;
    // Phần hoa hồng chủ sân đích chịu — ghi vào đơn mới và sổ cái, không ảnh hưởng số tiền khách trả
    quote.newOwnerCommission = newFee.ownerCommission;

    const balance = verifyBalance(quote);
    if (!balance.balanced) fail(500, 'Lỗi tính toán chi phí chuyển sân, vui lòng thử lại');

    // --- Giữ chỗ khung giờ đích trong thời gian khách cân nhắc ---
    const ttl = settings.quoteTtlMinutes ?? 10;
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);
    const hold = await Hold.create({
        userId: user._id, venueId: toVenue._id, courtId: toCourt._id,
        date: toDate, startTime: toStartTime, endTime: toEndTime, expiresAt,
    });

    const transfer = await TransferRequest.create({
        fromBookingId: booking._id,
        customerId: user._id,
        type,
        fromVenueId: booking.venueId, fromCourtId: booking.courtId, fromOwnerId: fromVenue?.ownerId,
        fromVenueName: booking.venueName, fromCourtName: booking.courtName,
        fromDate: booking.date, fromStartTime: booking.startTime, fromEndTime: booking.endTime,
        toVenueId: toVenue._id, toCourtId: toCourt._id, toOwnerId: toVenue.ownerId,
        toVenueName: toVenue.name, toCourtName: toCourt.name,
        toDate, toStartTime, toEndTime,
        holdId: hold._id,
        quote, quoteExpiresAt: expiresAt,
        // Chụp tỉ lệ chia phí cho chủ sân gốc (chỉ có nghĩa với T4) tại thời điểm báo giá
        feeOriginSharePct: type === 'T4' ? (settings.transferFeeOriginSharePct || 0) : 0,
        status: 'quoted',
    });

    return { transfer, breakdown: buildBreakdown(quote), requiresApproval: requiresOwnerApproval(toVenue, type) };
}

/** Khung giờ đích có đang bị chiếm không — xét cả đơn, khoá ô và giữ chỗ. */
async function isTargetTaken({ courtId, date, startTime, endTime, excludeBookingId, userId }) {
    const bookingConflict = await Booking.findOne({
        courtId, date,
        _id: { $ne: excludeBookingId },
        status: { $nin: ['cancelled', 'transferred'] },
        startTime: { $lt: endTime }, endTime: { $gt: startTime },
    });
    if (bookingConflict) return true;

    if (await slotLock.isTaken({ courtId, date, startTime, endTime, excludeBookingId })) return true;

    const holdFilter = {
        courtId, date, consumed: false, expiresAt: { $gt: new Date() },
        startTime: { $lt: endTime }, endTime: { $gt: startTime },
    };
    if (userId) holdFilter.userId = { $ne: userId };
    return !!(await Hold.findOne(holdFilter));
}

// ============================================================
// 3. XÁC NHẬN
// ============================================================

async function confirmQuote({ transfer, user }) {
    if (transfer.status !== 'quoted') fail(409, 'Yêu cầu chuyển sân này không còn ở trạng thái chờ xác nhận');
    if (transfer.quoteExpiresAt < new Date()) {
        await expire(transfer, 'Báo giá đã hết hạn');
        fail(410, 'Báo giá đã hết hạn, vui lòng chọn lại khung giờ');
    }
    // Tư cách thành viên có thể bị gỡ giữa lúc báo giá và lúc xác nhận
    const networkBlock = await require('../utils/transferNetwork').crossOwnerBlocker({
        type: transfer.type, fromOwnerId: transfer.fromOwnerId, toOwnerId: transfer.toOwnerId, settings: await getSettings(),
    });
    if (networkBlock) fail(409, networkBlock);

    const toVenue = await Venue.findById(transfer.toVenueId);
    // BR-TR-14: chủ sân đích có quyền tự tay duyệt từng lượt chuyển đến
    if (requiresOwnerApproval(toVenue, transfer.type)) {
        const settings = await getSettings();
        const timeout = settings.ownerApprovalTimeoutMinutes ?? 30;
        transfer.status = 'awaiting_owner_approval';
        transfer.quoteExpiresAt = new Date(Date.now() + timeout * 60 * 1000);
        await transfer.save();
        await Hold.findByIdAndUpdate(transfer.holdId, { expiresAt: transfer.quoteExpiresAt });
        await Notification.create({
            userId: transfer.toOwnerId,
            type: 'transfer_request', icon: '🔄',
            ...transferMessages.approvalRequest(transfer, timeout),
        });
        return { status: 'awaiting_owner_approval', transfer };
    }

    return proceedAfterApproval({ transfer, user });
}

/** Sau khi (không cần hoặc đã được) duyệt: thu tiền hoặc thực thi luôn. */
async function proceedAfterApproval({ transfer, user }) {
    // Chủ sân đích có thể mất tư cách thành viên trong lúc chờ họ duyệt — kiểm tra lại TRƯỚC khi thu tiền.
    const networkBlock = await require('../utils/transferNetwork').crossOwnerBlocker({
        type: transfer.type, fromOwnerId: transfer.fromOwnerId, toOwnerId: transfer.toOwnerId, settings: await getSettings(),
    });
    if (networkBlock) fail(409, networkBlock);

    // S > 0: phải thu thêm trước. Đơn gốc vẫn còn nguyên hiệu lực cho tới khi
    // cổng thanh toán báo thành công.
    if (transfer.quote.settlement > 0) {
        transfer.status = 'awaiting_payment';
        await transfer.save();
        return { status: 'awaiting_payment', transfer, amountDue: transfer.quote.settlement };
    }

    const result = await execute(transfer);
    return { status: 'completed', ...result };
}

// ============================================================
// 4. THỰC THI — giao dịch nguyên tử
// ============================================================

/**
 * Bước duy nhất làm thay đổi thực sự. Mọi kiểm tra đều được làm LẠI ở đây dù
 * đã kiểm tra lúc báo giá, vì giữa hai thời điểm có thể đã có người khác đặt
 * mất khung giờ hoặc quản trị viên đã tạm ngưng địa điểm.
 *
 * Khung giờ GỐC chỉ được giải phóng ở bước (e) — bên trong giao dịch. Nếu giải
 * phóng sớm hơn mà giao dịch thất bại, khách sẽ mất cả hai khung giờ.
 */
async function execute(transfer) {
    // T5 không đổi sân/khung giờ nên không tạo đơn mới — xử lý ở nhánh riêng.
    if (transfer.type === 'T5') {
        return require('./assignmentService').executeAssignment(transfer);
    }

    const q = transfer.quote;

    const booking = await Booking.findById(transfer.fromBookingId);
    if (!booking) fail(404, 'Không tìm thấy lượt đặt gốc');
    if (booking.status !== 'confirmed') fail(409, 'Lượt đặt gốc không còn hiệu lực');

    const [toVenue, toCourt] = await Promise.all([
        Venue.findById(transfer.toVenueId), Court.findById(transfer.toCourtId),
    ]);
    if (!toVenue || !toCourt) fail(404, 'Địa điểm hoặc sân đích không còn tồn tại');
    if (toCourt.status !== 'active' || !toVenue.isActive || toVenue.status !== 'approved') {
        fail(409, 'Địa điểm đích hiện không nhận đặt sân');
    }

    // Chia phí chuyển sân cho chủ sân gốc (T4). Số này ghi cả hai phía để quyết toán luôn cân.
    const feeShare = require('../utils/transferSplit').originFeeShare({ type: transfer.type, transferFee: q.transferFee, pct: transfer.feeOriginSharePct });

    let newBooking;
    await withTransaction(async (session) => {
        const opt = session ? { session } : {};

        // (b) Tạo đơn mới. Tạo TRƯỚC để có _id gắn vào khoá khung giờ.
        const created = await Booking.create([{
            customerId: booking.customerId,
            venueId: toVenue._id, courtId: toCourt._id,
            venueName: toVenue.name, courtName: toCourt.name,
            date: transfer.toDate, startTime: transfer.toStartTime, endTime: transfer.toEndTime,
            duration: durationHours(transfer.toStartTime, transfer.toEndTime),
            sport: courtRules.sportOf(toCourt) || booking.sport, notes: booking.notes,
            amount: q.newAmount, serviceFee: q.newServiceFee,
            ownerCommission: q.newOwnerCommission || 0,
            commissionRate: Math.round((q.commissionRate || 0) * 10000) / 100,
            promoCode: q.newDiscount > 0 ? booking.promoCode : '',
            discountAmount: q.newDiscount,
            status: 'confirmed',
            paymentMethod: booking.paymentMethod,
            transferredFromBookingId: booking._id,
            rootBookingId: booking.rootBookingId || booking._id,
            transferCount: (booking.transferCount || 0) + 1,
            transferFeeAmount: q.transferFee,
            transferFeeShareOut: feeShare,
            ...(await require('./cancellationPolicyService').snapshotFor(toVenue.ownerId)),
            originalPaidAmount: (booking.originalPaidAmount || q.oldPaid) + Math.max(0, q.settlement),
        }], opt);
        newBooking = created[0];

        // (a) Giành khung giờ đích. Ràng buộc duy nhất ở cấp DB là chốt chặn
        // cuối cùng — nếu có yêu cầu khác vừa giành mất, bước này thất bại và
        // toàn bộ giao dịch bị huỷ bỏ.
        const got = await slotLock.acquire({
            courtId: toCourt._id, date: transfer.toDate,
            startTime: transfer.toStartTime, endTime: transfer.toEndTime,
            bookingId: newBooking._id,
        }, session);
        if (!got) fail(409, 'Khung giờ này vừa có người khác đặt mất, vui lòng chọn khung giờ khác');

        // (c) Đơn gốc chuyển sang 'transferred' — KHÔNG xoá, KHÔNG sửa đè.
        await Booking.updateOne({ _id: booking._id }, {
            status: 'transferred',
            transferredToBookingId: newBooking._id,
            compensationAmount: q.compensation,
            transferFeeShareIn: feeShare,
            rootBookingId: booking.rootBookingId || booking._id,
        }, opt);

        // (d) Giải phóng khung giờ gốc
        await slotLock.release(booking._id, session);

        // (e) Ghi sổ cái — đã kiểm tra đẳng thức cân đối ở bước báo giá
        await ledger.record(ledger.transferEntries({ transfer, newBooking, quote: q }), session);

        // (f) Tiêu thụ lượt giữ chỗ để không ai dùng lại
        if (transfer.holdId) await Hold.updateOne({ _id: transfer.holdId }, { consumed: true }, opt);

        // (g) Chốt trạng thái yêu cầu
        await TransferRequest.updateOne({ _id: transfer._id }, {
            status: 'completed', toBookingId: newBooking._id, completedAt: new Date(),
        }, opt);
    });

    // Các bước phụ, thất bại không được phép làm hỏng giao dịch đã chốt
    await settleMoney(transfer, newBooking).catch((e) => console.error('settleMoney:', e.message));
    await notifyAllParties(transfer, newBooking).catch((e) => console.error('notify:', e.message));
    // Lượt đặt gốc đã chuyển đi → đóng bài "tìm người chơi" gắn với nó (chủ nhóm có thể đăng lại cho lượt đặt mới)
    await require('./playerService').closeForBooking(booking._id, 'lượt đặt đã được chuyển sang khung giờ/địa điểm khác');

    return { transfer, newBooking, oldBooking: booking };
}

// ============================================================
// 5. QUYẾT TOÁN TIỀN
// ============================================================

async function settleMoney(transfer, newBooking) {
    const q = transfer.quote;
    if (q.settlement >= 0) return;

    // Phần tiền mặt: luôn tạo yêu cầu hoàn thủ công — chuyển khoản ngân hàng
    // không có API hoàn tiền tự động (xem services/refundService.js).
    if (q.refundCash > 0) {
        const payment = await refundService.createRefund({
            amount: q.refundCash,
            reason: 'Hoàn chênh lệch khi chuyển sân',
            bookingId: transfer.fromBookingId,
            transferId: transfer._id,
            customerId: transfer.customerId,
            // Chủ sân cũ đang giữ tiền khách đã trả cho đơn gốc → họ hoàn phần chênh
            refundOwnerId: transfer.fromOwnerId,
        });
        if (payment) await TransferRequest.updateOne({ _id: transfer._id }, { refundPaymentId: payment._id });
    }

    // Phần số dư khuyến mãi: cộng ngay, dùng được cho đơn sau
    if (q.refundCredit > 0) {
        const user = await User.findByIdAndUpdate(
            transfer.customerId, { $inc: { creditBalance: q.refundCredit } }, { new: true }
        );
        await CreditTransaction.create({
            userId: transfer.customerId,
            amount: q.refundCredit,
            balanceAfter: user?.creditBalance || q.refundCredit,
            reason: 'transfer_refund',
            transferId: transfer._id,
            bookingId: newBooking._id,
            note: 'Phần hoàn vượt trần tiền mặt khi chuyển sân',
        });
    }
}

async function notifyAllParties(transfer) {
    // Nội dung ở utils/transferMessages.js (đổi lịch dùng lời lẽ riêng và chỉ báo chủ sân một lần)
    await Notification.create(transferMessages.completedNotifications(transfer));
}

// ============================================================
// 6. KẾT THÚC KHÔNG THÀNH CÔNG
// ============================================================

/**
 * Dùng chung cho mọi nhánh thất bại (từ chối, hết hạn, lỗi kỹ thuật).
 * Nguyên tắc: đơn gốc LUÔN được giữ nguyên, và mọi khoản đã thu thêm được
 * hoàn 100% — khách không chịu thiệt vì nguyên nhân ngoài tầm kiểm soát.
 */
async function abort(transfer, status, reason) {
    if (['completed', 'rejected', 'expired', 'cancelled', 'failed'].includes(transfer.status)) return transfer;

    if (transfer.holdId) await Hold.deleteOne({ _id: transfer.holdId }).catch(() => {});

    // Hoàn 100% khoản đã thu thêm nếu khách đã kịp thanh toán
    const paid = await Payment.findOne({ transferId: transfer._id, purpose: 'transfer_topup', status: 'completed' });
    if (paid) {
        await refundService.createRefund({
            amount: paid.amount,
            reason: `Chuyển sân không thành công: ${reason}`,
            bookingId: transfer.fromBookingId,
            transferId: transfer._id,
            customerId: transfer.customerId,
            prefix: 'RV',
            // Chủ sân đã nhận khoản bù thì chính họ hoàn lại
            refundOwnerId: paid.receiver?.ownerId || transfer.toOwnerId,
        });
    }

    transfer.status = status;
    if (status === 'rejected') transfer.rejectionReason = reason;
    else transfer.failureReason = reason;
    await transfer.save();

    await Notification.create({
        userId: transfer.customerId,
        type: 'transfer', icon: '⚠️',
        ...transferMessages.failureNotification(transfer, reason, paid ? paid.amount : 0),
        link: '/bookings',
    }).catch(() => {});

    return transfer;
}

const expire = (transfer, reason = 'Yêu cầu đã hết hạn') => abort(transfer, 'expired', reason);

module.exports = {
    checkEligibility, createQuote, confirmQuote, proceedAfterApproval,
    execute, abort, expire, isTargetTaken, fail,
};
