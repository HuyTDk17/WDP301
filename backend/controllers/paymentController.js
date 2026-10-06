const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const TransferRequest = require('../models/TransferRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { getSettings } = require('../utils/platformSettings');
const ledger = require('../utils/ledger');
const Venue = require('../models/Venue');
const slotLock = require('../utils/slotLock');
const credit = require('../utils/credit');
const bankTransfer = require('../utils/bankTransfer');
const { OPEN_STATUSES, findOpenForBooking, voidOpenForBooking } = require('../utils/openPayments');

/**
 * THANH TOÁN — CHUYỂN KHOẢN NGÂN HÀNG TRỰC TIẾP.
 *
 * Trước đây hệ thống tích hợp VNPay/MoMo: đăng ký merchant, ký chữ số, gọi
 * IPN — xác nhận gần như tức thời và hoàn toàn tự động. Đổi sang chuyển khoản
 * ngân hàng nghĩa là đánh đổi tốc độ triển khai (không cần đăng ký, chạy được
 * ngay) lấy tốc độ xác nhận (mặc định phải có người đối chiếu sao kê thủ
 * công, trừ khi bật đối soát tự động qua webhook của bên thứ ba).
 *
 * Luồng:
 *   1. checkout() — tạo Payment method='bank_transfer', trả về số tài khoản +
 *      mã QR VietQR + nội dung chuyển khoản (chính là orderRef).
 *   2. Khách chuyển khoản bằng app ngân hàng của mình (ngoài hệ thống).
 *   3. markTransferred() — khách bấm "Tôi đã chuyển khoản", payment chuyển
 *      sang 'awaiting_confirmation'. Từ lúc này đơn KHÔNG bị tác vụ nền tự huỷ
 *      (xem jobs/index.js).
 *   4. Xác nhận — MỌI khoản (đặt sân, bù tiền/phí chuyển sân) khách đều chuyển
 *      THẲNG vào tài khoản của CHỦ SÂN (lưu ở payment.receiver). Chủ sân tự đối
 *      chiếu sao kê và bấm xác nhận/từ chối (ownerConfirmBankTransfer /
 *      ownerRejectBankTransfer). Quản trị viên chỉ vận hành hệ thống và thu hoa
 *      hồng qua hoá đơn đối soát (services/settlementService.js) — KHÔNG có
 *      endpoint nào cho quản trị viên xác nhận, từ chối hay hoàn tiền.
 */

async function onPaymentSucceeded(payment, method) {
    const settings = await getSettings();

    // Chuyển khoản trực tiếp không qua trung gian nào nên không phát sinh phí
    // cổng — khác VNPay/MoMo trước đây luôn trừ 1–2,2% vào lợi nhuận ròng.
    payment.gatewayFee = 0;
    await payment.save();

    // --- Nhánh 1: khoản bù khi CHUYỂN SÂN ---
    if (payment.purpose === 'transfer_topup') {
        const transfer = await TransferRequest.findById(payment.transferId);
        if (!transfer || transfer.status !== 'awaiting_payment') return;
        try {
            await require('../services/transferService').execute(transfer);
        } catch (err) {
            await require('../services/transferService').abort(
                transfer, 'failed', err.message || 'Không thể hoàn tất chuyển sân'
            );
        }
        return;
    }

    // --- Nhánh 2: đơn đặt sân thông thường ---
    const booking = await Booking.findById(payment.bookingId);
    if (!booking || booking.status !== 'awaiting_payment') return;

    const gross = booking.amount + (booking.serviceFee || 0) - (booking.discountAmount || 0);

    booking.status = 'confirmed';
    booking.paymentMethod = method;
    // Tổng giá trị khách đã bỏ ra, TÍNH CẢ phần trả bằng số dư — dùng để áp
    // trần hoàn tiền khi chuyển sân sau này.
    booking.originalPaidAmount = gross;
    await booking.save();

    await slotLock.acquire({
        courtId: booking.courtId, date: booking.date,
        startTime: booking.startTime, endTime: booking.endTime, bookingId: booking._id,
    }).catch(() => {});

    if (booking.promoCode) {
        const Promotion = require('../models/Promotion');
        await Promotion.updateOne({ code: booking.promoCode }, { $inc: { usedCount: 1 } }).catch(() => {});
    }

    const venue = await Venue.findById(booking.venueId).select('ownerId');

    const entries = ledger.bookingEntries({
        booking, ownerId: venue?.ownerId, payment,
        gatewayFee: 0,
    });

    if (booking.creditApplied > 0) {
        entries.push({
            entryType: 'credit_redeemed', direction: 'platform_in',
            amount: booking.creditApplied,
            bookingId: booking._id, paymentId: payment._id,
            customerId: booking.customerId, occurredAt: new Date(),
            note: 'Khách dùng số dư khuyến mãi trừ vào đơn',
        });
    }

    await ledger.record(entries).catch((e) => console.error('ledger:', e.message));

    await Notification.create({
        userId: booking.customerId, type: 'payment', icon: '✅',
        title: 'Thanh toán thành công',
        message: `Chuyển khoản của bạn cho lượt đặt "${booking.venueName}" đã được xác nhận. Lượt đặt đã chuyển sang trạng thái đã xác nhận.`,
        link: '/bookings',
    }).catch(() => {});
}

function generateOrderRef(prefix, id) {
    return `${prefix}${id.toString().slice(-8)}${Date.now().toString().slice(-6)}`;
}

/**
 * Trả lại MỌI khoản đã giữ chỗ (số dư khuyến mãi) khi thanh
 * toán không thành công — đơn hết hạn, khách huỷ trước khi trả tiền, hoặc
 * quản trị viên từ chối một giao dịch chuyển khoản không khớp sao kê.
 */
async function releaseHoldsOnFailure(booking) {
    if (!booking || booking.status !== 'awaiting_payment') return;

    if (booking.creditApplied > 0) {
        await credit.release(booking.customerId, booking.creditApplied, {
            bookingId: booking._id,
            note: 'Hoàn lại số dư do thanh toán không thành công',
        }).catch(() => {});
        booking.creditApplied = 0;
    }
    await booking.save();
}

// ============================================================
// KHỞI TẠO GIAO DỊCH
// ============================================================

// @route   POST /api/payments/checkout
// Body: { bookingId, useCredit? }
//
// Trả về:
//   - { paid: true, ... }                     nếu số dư trả đủ toàn bộ
//   - { bankTransfer: {...}, paymentId, ... }  nếu còn phải chuyển khoản
exports.checkout = asyncHandler(async (req, res) => {
    const { bookingId, useCredit = true } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    if (booking.customerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền thanh toán cho lượt đặt này' });
    }
    if (booking.status !== 'awaiting_payment') {
        return res.status(409).json({ message: 'Lượt đặt này không ở trạng thái chờ thanh toán' });
    }

    const settings = await getSettings();

    // ===== IDEMPOTENT: đơn đã có giao dịch đang mở thì trả lại CHÍNH giao dịch đó =====
    // Bấm "Thanh toán" lần hai (bấm đúp, mở lại từ Lịch sử, tải lại trang) không
    // được sinh thêm một giao dịch/mã QR mới — nếu không chủ sân sẽ thấy hai
    // dòng cho một đơn và khách có thể chuyển tiền hai lần. Hướng dẫn được dựng
    // lại từ ảnh chụp tài khoản lưu trên giao dịch, nên QR luôn giống hệt lần đầu.
    const open = await findOpenForBooking(booking._id);
    if (open) return res.json(openPaymentResponse(open, booking, settings));

    const gross = booking.amount + booking.serviceFee - (booking.discountAmount || 0);

    // ===== Số dư khuyến mãi =====
    // Giữ chỗ NGAY tại đây, không đợi tới lúc chuyển khoản được xác nhận, để
    // khách không thể mở hai tab và tiêu cùng một số dư cho hai đơn. Dùng lại
    // nếu đơn đã giữ chỗ từ lần bấm trước — khách bấm "Thanh toán" hai lần
    // không được phép trừ số dư hai lần.
    if (useCredit && booking.creditApplied === 0) {
        const reserved = await credit.reserve(req.user._id, gross, {
            bookingId: booking._id,
            note: `Giữ chỗ số dư cho đơn ${booking._id}`,
        });
        if (reserved > 0) {
            booking.creditApplied = reserved;
            await booking.save();
        }
    }

    const payable = Math.max(0, gross - (booking.creditApplied || 0));

    // ===== Số dư trả đủ toàn bộ: xác nhận ngay, không cần chuyển khoản =====
    if (payable === 0) {
        const payment = await Payment.create({
            bookingId: booking._id,
            method: 'credit',
            amount: gross,
            creditApplied: booking.creditApplied,
            orderRef: generateOrderRef('CR', booking._id),
            status: 'completed',
        });
        await onPaymentSucceeded(payment, 'credit');
        return res.status(201).json({
            paid: true,
            bookingId: booking._id,
            creditApplied: booking.creditApplied,
            message: 'Đơn đã được thanh toán hoàn toàn bằng số dư khuyến mãi',
        });
    }

    // ===== Tài khoản nhận tiền = tài khoản của CHỦ SÂN, không phải của nền tảng =====
    const venue = await Venue.findById(booking.venueId).select('ownerId');
    const owner = venue?.ownerId
        ? await User.findById(venue.ownerId).select('name bankName bankBin bankAccount bankAccountName')
        : null;
    const account = bankTransfer.ownerAccount(owner);

    if (!bankTransfer.isAccountReady(account)) {
        // Trả lại số dư đã giữ chỗ ở trên — khách chưa có cách nào trả tiền
        // nên không được để các khoản này bị treo cho tới khi đơn hết hạn.
        await releaseHoldsOnFailure(booking);
        return res.status(409).json({
            message: 'Chủ sân chưa cập nhật tài khoản nhận thanh toán nên chưa thể chuyển khoản cho địa điểm này. '
                + 'Vui lòng liên hệ chủ sân hoặc thử lại sau.',
        });
    }

    const orderRef = generateOrderRef('SV', booking._id);
    let payment;
    try {
        payment = await Payment.create({
            bookingId: booking._id, method: 'bank_transfer', amount: payable,
            creditApplied: booking.creditApplied, orderRef, status: 'pending',
            // Ảnh chụp tài khoản đã hiển thị cho khách — xem ghi chú ở models/Payment.js
            receiver: {
                ownerId: owner._id, bankName: account.bankName, bankBin: account.bankBin,
                accountNumber: account.accountNumber, accountName: account.accountName,
            },
        });
    } catch (err) {
        // Hai yêu cầu cùng lúc (bấm đúp/hai tab): yêu cầu chậm hơn đụng unique
        // index `openKey` → trả lại giao dịch mà yêu cầu nhanh hơn vừa tạo.
        if (err?.code === 11000) {
            const winner = await findOpenForBooking(booking._id);
            if (winner) return res.json(openPaymentResponse(winner, booking, settings));
        }
        throw err;
    }

    res.status(201).json(openPaymentResponse(payment, booking, settings));
});

/** Phản hồi checkout cho một giao dịch đang mở (mới tạo hoặc dùng lại). */
function openPaymentResponse(payment, booking, settings) {
    const receiver = payment.receiver?.ownerId ? payment.receiver : null;
    const bankInfo = receiver
        ? bankTransfer.buildInstructionsForAccount({
            account: {
                bankName: receiver.bankName, bankBin: receiver.bankBin,
                accountNumber: receiver.accountNumber, accountName: receiver.accountName,
            },
            windowMinutes: settings.bankTransferWindowMinutes, amount: payment.amount, content: payment.orderRef,
        })
        : { configured: false };
    return {
        paymentId: payment._id,
        status: payment.status,
        // Khách ĐÃ báo chuyển khoản — giao diện phải hiện màn hình chờ, KHÔNG hiện
        // lại mã QR để tránh khách chuyển tiền lần thứ hai.
        alreadyReported: payment.status === 'awaiting_confirmation',
        payable: payment.amount,
        creditApplied: booking.creditApplied || 0,
        orderRef: payment.orderRef,
        bankTransfer: bankInfo,
    };
}

// ============================================================
// KHÁCH BÁO ĐÃ CHUYỂN KHOẢN
// ============================================================

/** Payment này có thuộc về req.user không (qua booking hoặc qua transfer). */
async function loadOwnPayment(paymentId, user) {
    const payment = await Payment.findById(paymentId);
    if (!payment) return { error: [404, 'Không tìm thấy giao dịch này'] };

    if (payment.bookingId) {
        const booking = await Booking.findById(payment.bookingId).select('customerId');
        if (!booking || String(booking.customerId || '') !== String(user._id)) {
            return { error: [403, 'Bạn không có quyền với giao dịch này'] };
        }
    } else if (payment.transferId) {
        const transfer = await TransferRequest.findById(payment.transferId).select('customerId toCustomerId');
        const isOwner = transfer && [transfer.customerId, transfer.toCustomerId]
            .some((id) => String(id || '') === String(user._id));
        if (!isOwner) return { error: [403, 'Bạn không có quyền với giao dịch này'] };
    } else {
        return { error: [403, 'Bạn không có quyền với giao dịch này'] };
    }

    return { payment };
}

// @route POST /api/payments/:id/mark-transferred
// Khách bấm "Tôi đã chuyển khoản" sau khi thao tác xong trên app ngân hàng.
exports.markTransferred = asyncHandler(async (req, res) => {
    const { payment, error } = await loadOwnPayment(req.params.id, req.user);
    if (error) return res.status(error[0]).json({ message: error[1] });

    if (payment.status === 'completed') return res.json({ payment });
    if (payment.status === 'awaiting_confirmation') return res.json({ payment, alreadyReported: true });
    if (payment.status !== 'pending') {
        return res.status(409).json({ message: 'Giao dịch này không ở trạng thái chờ chuyển khoản' });
    }

    // Chuyển trạng thái NGUYÊN TỬ (chỉ khi còn 'pending'): hai lần bấm đồng thời
    // chỉ một lần thắng, nên chủ sân không bao giờ nhận hai thông báo cho một đơn.
    const updated = await Payment.findOneAndUpdate(
        { _id: payment._id, status: 'pending' },
        { $set: { status: 'awaiting_confirmation', customerMarkedPaidAt: new Date() } },
        { new: true },
    );
    if (!updated) {
        const current = await Payment.findById(payment._id);
        return res.json({ payment: current, alreadyReported: true });
    }
    payment.status = updated.status;
    payment.customerMarkedPaidAt = updated.customerMarkedPaidAt;

    // Báo cho chủ sân nhận tiền — người duy nhất xác nhận được giao dịch này.
    const ownerId = payment.receiver?.ownerId;
    if (ownerId) {
        await Notification.create({
            userId: ownerId, type: 'payment', icon: '🏦',
            title: 'Có giao dịch chờ xác nhận chuyển khoản',
            message: `Đơn ${payment.orderRef} — ${payment.amount.toLocaleString('vi-VN')}đ. Vui lòng kiểm tra tài khoản ngân hàng của bạn và xác nhận.`,
            link: '/owner/payments/pending',
        }).catch(() => {});
    }

    res.json({ payment });
});

// ============================================================
// XÁC NHẬN / TỪ CHỐI — LOGIC DÙNG CHUNG
// ============================================================

/**
 * Đơn của giao dịch này còn xác nhận được không? Trả về câu báo lỗi nếu không.
 * Đơn đã huỷ/hết hạn mà vẫn "xác nhận" thì giao dịch sẽ thành completed nhưng
 * không có lượt đặt nào được tạo — chủ sân tưởng đã xong còn khách mất tiền.
 */
async function bookingBlocksConfirm(payment) {
    if (payment.purpose === 'transfer_topup') {
        const transfer = payment.transferId ? await TransferRequest.findById(payment.transferId).select('status') : null;
        if (transfer?.status === 'awaiting_payment') return null;
        return 'Yêu cầu chuyển sân này đã bị huỷ hoặc hết hạn nên không thể xác nhận. '
            + 'Nếu khách đã chuyển tiền, hãy hoàn lại cho khách rồi bấm Từ chối để đóng giao dịch.';
    }
    if (payment.purpose !== 'booking' || !payment.bookingId) return null;
    const booking = await Booking.findById(payment.bookingId).select('status');
    if (!booking) return 'Không tìm thấy lượt đặt sân của giao dịch này';
    if (booking.status === 'awaiting_payment') return null;
    if (booking.status === 'confirmed') {
        return 'Lượt đặt này đã được xác nhận trước đó — không cần xác nhận lại.';
    }
    return 'Lượt đặt này đã bị huỷ hoặc hết hạn nên không thể xác nhận. '
        + 'Nếu khách đã chuyển tiền, hãy hoàn lại cho khách rồi bấm Từ chối để đóng giao dịch.';
}

/**
 * Đánh dấu giao dịch đã nhận tiền và chạy toàn bộ luồng hậu thanh toán.
 *
 * "Giành quyền" NGUYÊN TỬ (chỉ khi giao dịch còn mở): hai lần bấm xác nhận
 * đồng thời, hoặc chủ sân bấm lại, thì chỉ một lần chạy onPaymentSucceeded —
 * nếu không sổ cái, điểm tích luỹ, mã khuyến mãi sẽ bị ghi hai lần.
 * Trả về giao dịch đã hoàn tất, hoặc null nếu đã có người xử lý trước.
 */
async function confirmPayment(payment, confirmerId) {
    const claimed = await Payment.findOneAndUpdate(
        { _id: payment._id, status: { $in: OPEN_STATUSES } },
        { $set: { status: 'completed', bankConfirmedBy: confirmerId, bankConfirmedAt: new Date() }, $unset: { openKey: '' } },
        { new: true },
    );
    if (!claimed) return null;

    await onPaymentSucceeded(claimed, 'bank_transfer');
    // Phòng dữ liệu cũ đã lỡ có giao dịch trùng: đóng hết, chủ sân không còn
    // thấy "đơn thứ hai" cho cùng một lượt đặt.
    if (claimed.purpose === 'booking' && claimed.bookingId) {
        await voidOpenForBooking(claimed.bookingId, 'Đơn đã được xác nhận bằng giao dịch khác', { exceptId: claimed._id });
    }
    return claimed;
}

/**
 * Từ chối giao dịch không khớp: đóng MỌI giao dịch đang mở của đơn (chủ sân từ
 * chối một lần là xong, không phải từ chối từng dòng), nhả giữ chỗ, báo khách.
 */
async function rejectPayment(payment, reason, { contactHint }) {
    payment.status = 'failed';
    payment.refundReason = reason;
    await payment.save();

    if (payment.purpose === 'booking' && payment.bookingId) {
        await voidOpenForBooking(payment.bookingId, reason, { exceptId: payment._id });
        const booking = await Booking.findById(payment.bookingId);
        await releaseHoldsOnFailure(booking);
        if (booking?.customerId) {
            await Notification.create({
                userId: booking.customerId, type: 'payment', icon: '⚠️',
                title: 'Không xác nhận được giao dịch chuyển khoản',
                message: `${payment.refundReason}. Vui lòng kiểm tra lại nội dung và số tài khoản, hoặc ${contactHint}.`,
                link: '/bookings',
            }).catch(() => {});
        }
    } else if (payment.purpose === 'transfer_topup' && payment.transferId) {
        const transfer = await TransferRequest.findById(payment.transferId);
        if (transfer) {
            await require('../services/transferService').abort(transfer, 'failed', payment.refundReason);
        }
    }
}

const PENDING_STATUSES = OPEN_STATUSES;

// ============================================================
// CHỦ SÂN — XÁC NHẬN CHUYỂN KHOẢN ĐƠN ĐẶT SÂN CỦA MÌNH
// ============================================================

/**
 * Tải giao dịch mà CHỦ SÂN này được quyền xử lý: phải là đơn đặt sân và tài
 * khoản nhận tiền ghi nhận lúc checkout đúng là của chủ sân này. Dựa vào
 * `payment.receiver.ownerId` (bản chụp lúc tạo giao dịch) thay vì tra ngược
 * booking → venue → owner, để chủ sân cũ/mới của một địa điểm không lẫn nhau.
 */
async function loadOwnerPayment(paymentId, owner) {
    const payment = await Payment.findById(paymentId);
    if (!payment || !['booking', 'transfer_topup'].includes(payment.purpose)
        || String(payment.receiver?.ownerId || '') !== String(owner._id)) {
        // 404 chung cho cả "không tồn tại" lẫn "không phải của bạn", để không lộ
        // ra việc một mã giao dịch của người khác có tồn tại.
        return { error: [404, 'Không tìm thấy giao dịch này'] };
    }
    return { payment };
}

// @route GET /api/owner/payments/pending-bank
//
// Chỉ liệt kê giao dịch khách ĐÃ báo "Tôi đã chuyển khoản" (awaiting_confirmation).
// Giao dịch mới tạo mà khách chưa báo ('pending') chưa có gì để đối chiếu nên không
// hiện — nếu hiện, chủ sân thấy hai dòng cho một đơn (một "chưa báo", một "đã báo")
// và dễ xử lý nhầm. Mỗi lượt đặt chỉ hiện MỘT dòng, kể cả khi dữ liệu cũ có trùng.
exports.getOwnerPendingBankPayments = asyncHandler(async (req, res) => {
    const found = await Payment.find({
        method: 'bank_transfer',
        purpose: { $in: ['booking', 'transfer_topup'] },
        'receiver.ownerId': req.user._id,
        status: 'awaiting_confirmation',
    })
        .populate({
            path: 'bookingId',
            select: 'venueName courtName date startTime endTime customerId guestName guestPhone',
            populate: { path: 'customerId', select: 'name phone' },
        })
        .populate({
            path: 'transferId',
            select: 'type toVenueName toCourtName toDate toStartTime toEndTime customerId',
            populate: { path: 'customerId', select: 'name phone' },
        })
        .sort({ customerMarkedPaidAt: -1, createdAt: -1 });

    const seen = new Set();
    const payments = found.filter((p) => {
        const key = String(p.transferId?._id || p.bookingId?._id || p.bookingId || p._id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    res.json({ payments, total: payments.length });
});

// @route POST /api/owner/payments/:id/confirm-bank-transfer
exports.ownerConfirmBankTransfer = asyncHandler(async (req, res) => {
    const { payment, error } = await loadOwnerPayment(req.params.id, req.user);
    if (error) return res.status(error[0]).json({ message: error[1] });

    if (payment.status === 'completed') return res.json({ payment });
    if (!PENDING_STATUSES.includes(payment.status)) {
        return res.status(409).json({ message: 'Giao dịch này không ở trạng thái chờ xác nhận' });
    }

    const blocked = await bookingBlocksConfirm(payment);
    if (blocked) return res.status(409).json({ message: blocked });

    const done = await confirmPayment(payment, req.user._id);
    if (!done) return res.status(409).json({ message: 'Giao dịch này vừa được xử lý xong' });
    res.json({ payment: done });
});

// @route POST /api/owner/payments/:id/reject-bank-transfer
exports.ownerRejectBankTransfer = asyncHandler(async (req, res) => {
    const { payment, error } = await loadOwnerPayment(req.params.id, req.user);
    if (error) return res.status(error[0]).json({ message: error[1] });

    if (!PENDING_STATUSES.includes(payment.status)) {
        return res.status(409).json({ message: 'Giao dịch này không ở trạng thái có thể từ chối' });
    }

    await rejectPayment(
        payment,
        req.body.reason?.trim() || 'Chủ sân không thấy khoản chuyển khoản khớp nội dung và số tiền',
        { contactHint: 'liên hệ chủ sân' },
    );
    res.json({ payment });
});

// ============================================================
// TRA CỨU & HOÀN TIỀN
// ============================================================

// @route   GET /api/payments/:bookingId/status
exports.getPaymentStatus = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    if (String(booking.customerId || '') !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn không có quyền xem lượt đặt này' });
    }
    const payment = await Payment.findOne({ bookingId: booking._id, purpose: 'booking' }).sort({ createdAt: -1 });
    res.json({ status: booking.status, booking, payment });
});

exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const bookings = await Booking.find({ customerId: req.user._id }).select('_id');
    const bookingIds = bookings.map((b) => b._id);
    const payments = await Payment.find({ bookingId: { $in: bookingIds } }).sort({ createdAt: -1 });
    res.json({ payments });
});

exports.requestRefund = asyncHandler(async (req, res) => {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Không tìm thấy giao dịch này' });

    const booking = payment.bookingId ? await Booking.findById(payment.bookingId) : null;
    const isOwnerOfPayment = booking && String(booking.customerId || '') === String(req.user._id);
    if (!isOwnerOfPayment) {
        return res.status(403).json({ message: 'Bạn không có quyền với giao dịch này' });
    }
    if (payment.status !== 'completed') {
        return res.status(409).json({ message: 'Chỉ giao dịch đã thanh toán thành công mới yêu cầu hoàn tiền được' });
    }
    if (payment.method === 'credit') {
        return res.status(409).json({
            message: 'Đơn này được thanh toán bằng số dư khuyến mãi nên không hoàn ra tiền mặt được. '
                + 'Huỷ đơn sẽ hoàn lại vào số dư.',
        });
    }

    payment.status = 'refund_requested';
    payment.refundReason = req.body.reason || '';
    // Tiền đang nằm ở chủ sân → chủ sân là người hoàn
    payment.refundOwnerId = payment.receiver?.ownerId
        || await require('../services/refundService').ownerWhoReceived(payment.bookingId);
    await payment.save();
    if (payment.refundOwnerId) {
        await Notification.create({
            userId: payment.refundOwnerId, type: 'payment', icon: '💸',
            title: 'Khách yêu cầu hoàn tiền',
            message: `Giao dịch ${payment.orderRef} (${payment.amount.toLocaleString('vi-VN')}đ). Vui lòng kiểm tra và chuyển khoản lại nếu hợp lệ, rồi bấm "Đã hoàn tiền".`,
            link: '/owner/refunds',
        }).catch(() => {});
    }
    res.json({ payment });
});

// @route GET /api/owner/refunds — khoản chủ sân cần hoàn lại cho khách
exports.getOwnerRefunds = asyncHandler(async (req, res) => {
    const payments = await Payment.find({ refundOwnerId: req.user._id, status: 'refund_requested' })
        .populate({
            path: 'bookingId',
            select: 'venueName courtName date startTime customerId guestName',
            populate: { path: 'customerId', select: 'name phone' },
        })
        .sort({ createdAt: -1 });
    res.json({ payments, total: payments.length });
});

// @route PATCH /api/owner/refunds/:id/refunded — chủ sân đã chuyển khoản hoàn cho khách
exports.ownerMarkRefunded = asyncHandler(async (req, res) => {
    // Nguyên tử + đúng chủ sân: bấm hai lần hay chủ sân khác bấm đều không đổi được gì
    const done = await Payment.findOneAndUpdate(
        { _id: req.params.id, refundOwnerId: req.user._id, status: 'refund_requested' },
        { $set: { status: 'refunded' } },
        { new: true },
    );
    if (!done) {
        const existing = await Payment.findOne({ _id: req.params.id, refundOwnerId: req.user._id });
        if (!existing) return res.status(404).json({ message: 'Không tìm thấy khoản hoàn này' });
        return res.json({ payment: existing });
    }
    const booking = done.bookingId ? await Booking.findById(done.bookingId).select('customerId venueName') : null;
    if (booking?.customerId) {
        await Notification.create({
            userId: booking.customerId, type: 'payment', icon: '✅',
            title: 'Chủ sân đã hoàn tiền cho bạn',
            message: `${done.amount.toLocaleString('vi-VN')}đ từ "${booking.venueName}" đã được chuyển khoản lại. Vui lòng kiểm tra tài khoản ngân hàng của bạn.`,
            link: '/bookings',
        }).catch(() => {});
    }
    res.json({ payment: done });
});

module.exports.onPaymentSucceeded = onPaymentSucceeded;
