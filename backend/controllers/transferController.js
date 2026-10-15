const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const Payment = require('../models/Payment');
const User = require('../models/User');
const TransferRequest = require('../models/TransferRequest');
const asyncHandler = require('../utils/asyncHandler');
const { getSettings } = require('../utils/platformSettings');
const { buildBreakdown } = require('../utils/transferPricing');
const transferService = require('../services/transferService');
const assignmentService = require('../services/assignmentService');
const bankTransfer = require('../utils/bankTransfer');

// ============================================================
// KHÁCH HÀNG
// ============================================================

// @route GET /api/bookings/:id/transfer/eligibility
exports.getEligibility = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    // BR-TR-02
    if (String(booking.customerId || '') !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn không có quyền với lượt đặt này' });
    }

    const settings = await getSettings();
    const result = await transferService.checkEligibility(booking, settings);

    res.json({
        ...result,
        booking: {
            _id: booking._id, venueName: booking.venueName, courtName: booking.courtName,
            date: booking.date, startTime: booking.startTime, endTime: booking.endTime,
            amount: booking.amount, serviceFee: booking.serviceFee,
            discountAmount: booking.discountAmount, sport: booking.sport,
            paid: booking.amount + booking.serviceFee - (booking.discountAmount || 0),
        },
        // Gửi kèm biểu phí để khách biết chi phí TRƯỚC khi mất công tìm sân
        feePolicy: {
            transferFeeTiers: settings.transferFeeTiers,
            compensationTiers: settings.compensationTiers,
            transferFeeMin: settings.transferFeeMin,
            transferFeeMax: settings.transferFeeMax,
            maxRefundRatio: settings.maxRefundRatio,
        },
    });
});

// @route POST /api/bookings/:id/transfer/quote
exports.createQuote = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    if (String(booking.customerId || '') !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn không có quyền với lượt đặt này' });
    }

    const { transfer, breakdown, requiresApproval } = await transferService.createQuote({
        booking, target: req.body, user: req.user,
    });

    res.status(201).json({ transfer, breakdown, requiresApproval });
});

// @route POST /api/transfers/:id/confirm
exports.confirm = asyncHandler(async (req, res) => {
    const transfer = await loadOwnTransfer(req, res);
    if (!transfer) return;

    const result = await transferService.confirmQuote({ transfer, user: req.user });

    // Cần thu thêm tiền → sinh hướng dẫn chuyển khoản như luồng đặt sân thường
    if (result.status === 'awaiting_payment') {
        const info = await createTopupInstructions(transfer);
        return res.json({ status: 'awaiting_payment', amountDue: result.amountDue, ...info, transfer });
    }

    res.json(result);
});

// @route POST /api/transfers/:id/cancel
exports.cancel = asyncHandler(async (req, res) => {
    const transfer = await loadOwnTransfer(req, res);
    if (!transfer) return;
    if (!['quoted', 'awaiting_payment', 'awaiting_owner_approval'].includes(transfer.status)) {
        return res.status(409).json({ message: 'Yêu cầu này không thể huỷ ở trạng thái hiện tại' });
    }
    await transferService.abort(transfer, 'cancelled', 'Bạn đã huỷ yêu cầu chuyển sân');
    res.json({ transfer });
});

// @route GET /api/transfers/:id
exports.getById = asyncHandler(async (req, res) => {
    const transfer = await TransferRequest.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'Không tìm thấy yêu cầu chuyển sân' });

    // toCustomerId: người NHẬN trong giao dịch sang tên (T5) — họ cũng cần xem
    // được trang này để chuyển khoản phí, dù không phải người tạo yêu cầu.
    const isCustomer = [transfer.customerId, transfer.toCustomerId]
        .some((id) => String(id || '') === String(req.user._id));
    const isOwner = [transfer.fromOwnerId, transfer.toOwnerId].some((o) => String(o || '') === String(req.user._id));
    if (!isCustomer && !isOwner) {
        return res.status(403).json({ message: 'Bạn không có quyền xem yêu cầu này' });
    }

    // Khi còn đang chờ chuyển khoản, tái tạo lại hướng dẫn (số tài khoản, mã
    // QR, nội dung) để trang chi tiết hiển thị được mà không cần lưu sẵn ảnh
    // QR — mã QR chỉ ghép chuỗi tham số nên tạo lại lúc nào cũng giống hệt nhau.
    let paymentInfo = null;
    if (transfer.status === 'awaiting_payment' && transfer.paymentId) {
        const payment = await Payment.findById(transfer.paymentId);
        if (payment && ['pending', 'awaiting_confirmation'].includes(payment.status)) {
            const settings = await getSettings();
            const r = payment.receiver;
            paymentInfo = {
                paymentId: payment._id,
                status: payment.status,
                alreadyReported: payment.status === 'awaiting_confirmation',
                bankTransfer: r?.ownerId
                    ? bankTransfer.buildInstructionsForAccount({
                        account: { bankName: r.bankName, bankBin: r.bankBin, accountNumber: r.accountNumber, accountName: r.accountName },
                        windowMinutes: settings.bankTransferWindowMinutes, amount: payment.amount, content: payment.orderRef,
                    })
                    : { configured: false },
            };
        }
    }

    res.json({ transfer, breakdown: buildBreakdown(transfer.quote), paymentInfo });
});

// @route GET /api/transfers/my
exports.getMine = asyncHandler(async (req, res) => {
    // Gồm cả các suất được NGƯỜI KHÁC sang tên cho mình (loại T5)
    const filter = { $or: [{ customerId: req.user._id }, { toCustomerId: req.user._id }] };
    if (req.query.status) filter.status = req.query.status;
    const transfers = await TransferRequest.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json({ transfers, total: transfers.length });
});

// ============================================================
// SANG TÊN CHO NGƯỜI KHÁC (T5)
// ============================================================

// @route POST /api/bookings/:id/transfer/assign
// Người đang giữ suất tạo mã để gửi cho bạn bè.
exports.createAssignment = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    if (String(booking.customerId || '') !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn không có quyền với lượt đặt này' });
    }

    const { transfer, reused } = await assignmentService.createAssignment({ booking, user: req.user });
    res.status(reused ? 200 : 201).json({
        transfer,
        code: transfer.transferCode,
        expiresAt: transfer.quoteExpiresAt,
        fee: transfer.quote.transferFee,
        reused,
        message: reused
            ? 'Lượt đặt này đã có mã sang tên còn hiệu lực'
            : 'Đã tạo mã sang tên, hãy gửi mã này cho người nhận suất',
    });
});

// @route GET /api/transfers/claim/:code
// Người nhận tra mã để xem suất trước khi quyết định.
exports.lookupAssignment = asyncHandler(async (req, res) => {
    const transfer = await assignmentService.lookupByCode(req.params.code, req.user);
    res.json({
        transfer: {
            _id: transfer._id,
            venueName: transfer.fromVenueName,
            courtName: transfer.fromCourtName,
            date: transfer.fromDate,
            startTime: transfer.fromStartTime,
            endTime: transfer.fromEndTime,
            fromCustomerName: transfer.customerId?.name || 'Người dùng',
            expiresAt: transfer.quoteExpiresAt,
        },
        // Giá trị suất để người nhận biết mình đang nhận gì
        value: transfer.quote.oldPaid,
        fee: transfer.quote.transferFee,
    });
});

// @route POST /api/transfers/claim/:code
exports.claimAssignment = asyncHandler(async (req, res) => {
    const transfer = await assignmentService.lookupByCode(req.params.code, req.user);

    transfer.toCustomerId = req.user._id;
    await transfer.save();

    // Có phí thì người nhận phải trả trước; hết hạn mà chưa trả thì mã tự huỷ
    // và suất vẫn thuộc về người chuyển ban đầu.
    if (transfer.quote.transferFee > 0) {
        transfer.status = 'awaiting_payment';
        await transfer.save();
        const info = await createTopupInstructions(transfer);
        return res.json({ status: 'awaiting_payment', amountDue: transfer.quote.transferFee, ...info, transfer });
    }

    const result = await assignmentService.executeAssignment(transfer);
    res.json({ status: 'completed', ...result });
});

// @route POST /api/transfers/:id/cancel-assignment
exports.cancelAssignment = asyncHandler(async (req, res) => {
    const transfer = await loadOwnTransfer(req, res);
    if (!transfer) return;
    if (transfer.type !== 'T5') return res.status(400).json({ message: 'Yêu cầu này không phải sang tên' });
    await assignmentService.cancelAssignment(transfer);
    res.json({ transfer });
});

// ============================================================
// CHỦ SÂN
// ============================================================

// @route GET /api/owner/transfers
exports.getOwnerTransfers = asyncHandler(async (req, res) => {
    const me = req.user._id;
    const filter = { $or: [{ toOwnerId: me }, { fromOwnerId: me }] };
    if (req.query.status) filter.status = req.query.status;

    const transfers = await TransferRequest.find(filter)
        .populate('customerId', 'name phone avatar')
        .sort({ createdAt: -1 }).limit(100);

    // Chia sẵn hai nhóm để giao diện không phải tự lọc
    res.json({
        transfers,
        incoming: transfers.filter((t) => String(t.toOwnerId) === String(me)),
        outgoing: transfers.filter((t) => String(t.fromOwnerId) === String(me)),
        pendingCount: transfers.filter((t) => String(t.toOwnerId) === String(me) && t.status === 'awaiting_owner_approval').length,
    });
});

// @route POST /api/owner/transfers/:id/approve
exports.approve = asyncHandler(async (req, res) => {
    const transfer = await TransferRequest.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'Không tìm thấy yêu cầu chuyển sân' });
    if (String(transfer.toOwnerId) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Yêu cầu này không gửi đến địa điểm của bạn' });
    }
    if (transfer.status !== 'awaiting_owner_approval') {
        return res.status(409).json({ message: 'Yêu cầu này không còn chờ duyệt' });
    }
    if (transfer.quoteExpiresAt < new Date()) {
        await transferService.expire(transfer, 'Đã quá thời hạn phản hồi');
        return res.status(410).json({ message: 'Yêu cầu đã quá hạn phản hồi' });
    }

    const result = await transferService.proceedAfterApproval({ transfer, user: req.user });
    res.json(result);
});

// @route POST /api/owner/transfers/:id/reject
exports.reject = asyncHandler(async (req, res) => {
    const transfer = await TransferRequest.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'Không tìm thấy yêu cầu chuyển sân' });
    if (String(transfer.toOwnerId) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Yêu cầu này không gửi đến địa điểm của bạn' });
    }
    if (transfer.status !== 'awaiting_owner_approval') {
        return res.status(409).json({ message: 'Yêu cầu này không còn chờ duyệt' });
    }
    const reason = req.body.reason?.trim() || 'Chủ sân từ chối yêu cầu chuyển đến';
    await transferService.abort(transfer, 'rejected', reason);
    res.json({ transfer });
});

// @route PATCH /api/owner/venues/:id/transfer-policy
exports.setVenueTransferPolicy = asyncHandler(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    if (String(venue.ownerId) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn không có quyền với địa điểm này' });
    }
    venue.transferRequiresApproval = !!req.body.transferRequiresApproval;
    await venue.save();
    res.json({ venue });
});

// ============================================================
// HÀM PHỤ TRỢ
// ============================================================

async function loadOwnTransfer(req, res) {
    const transfer = await TransferRequest.findById(req.params.id);
    if (!transfer) { res.status(404).json({ message: 'Không tìm thấy yêu cầu chuyển sân' }); return null; }
    if (String(transfer.customerId) !== String(req.user._id)) {
        res.status(403).json({ message: 'Yêu cầu này không thuộc về bạn' }); return null;
    }
    return transfer;
}

/**
 * Tạo hướng dẫn chuyển khoản cho khoản BÙ THÊM khi chuyển sân (S > 0).
 *
 * Trước đây hàm này gọi sang VNPay/MoMo để lấy một URL redirect. Chuyển khoản
 * ngân hàng không có "trang thanh toán" nào để redirect tới — thay vào đó trả
 * về số tài khoản + mã QR + nội dung chuyển khoản để khách tự thao tác trên
 * app ngân hàng của mình, giống hệt luồng thanh toán đơn đặt sân thường
 * (paymentController.checkout).
 */
async function createTopupInstructions(transfer) {
    const settings = await getSettings();
    const amount = transfer.quote.settlement;

    // Khoản bù (gồm cả phí chuyển sân) chuyển THẲNG cho chủ sân của địa điểm nhận
    // — với sang tên (T5) là chủ sân của chính lượt đặt đó. Nền tảng không nhận tiền.
    const receiverOwnerId = transfer.toOwnerId || transfer.fromOwnerId;
    const owner = receiverOwnerId
        ? await User.findById(receiverOwnerId).select('name bankName bankBin bankAccount bankAccountName')
        : null;
    const account = bankTransfer.ownerAccount(owner);
    if (!bankTransfer.isAccountReady(account)) {
        await transferService.abort(transfer, 'failed', 'Chủ sân chưa cập nhật tài khoản nhận thanh toán');
        const err = new Error('Chủ sân chưa cập nhật tài khoản nhận thanh toán nên chưa thể chuyển khoản cho yêu cầu này. Lượt đặt ban đầu của bạn vẫn còn hiệu lực.');
        err.statusCode = 409;
        throw err;
    }

    const orderRef = `TF${transfer._id.toString().slice(-8)}${Date.now().toString().slice(-6)}`;

    const payment = await Payment.create({
        transferId: transfer._id, bookingId: transfer.fromBookingId,
        purpose: 'transfer_topup', method: 'bank_transfer', amount, orderRef, status: 'pending',
        receiver: {
            ownerId: owner._id, bankName: account.bankName, bankBin: account.bankBin,
            accountNumber: account.accountNumber, accountName: account.accountName,
        },
    });
    await TransferRequest.updateOne({ _id: transfer._id }, { paymentId: payment._id });

    // Chuyển khoản ngân hàng cần nhiều thời gian hơn một cú redirect qua cổng,
    // nên nới cửa sổ chờ thanh toán của yêu cầu chuyển sân ra bằng đúng cửa sổ
    // đã cấu hình cho đặt sân thường, thay vì giữ nguyên hạn báo giá ngắn ban đầu.
    const windowMinutes = settings.bankTransferWindowMinutes || 30;
    const newExpiry = new Date(Date.now() + windowMinutes * 60 * 1000);
    transfer.quoteExpiresAt = newExpiry;
    await transfer.save();

    // ⚠️ QUAN TRỌNG: Hold giữ khung giờ ĐÍCH phải được nới theo đúng hạn mới.
    // Nếu chỉ nới quoteExpiresAt mà quên Hold, Hold vẫn hết hạn theo mốc CŨ
    // (mốc báo giá 10 phút, hoặc mốc chờ chủ sân duyệt) — trong lúc khách còn
    // đang thao tác chuyển khoản, isTargetTaken() ở nơi khác không còn thấy
    // Hold này nữa và một khách khác có thể đặt mất đúng khung giờ đó. Loại T5
    // không đổi khung giờ nên không có holdId, bỏ qua là đúng.
    if (transfer.holdId) {
        await require('../models/Hold').updateOne({ _id: transfer.holdId }, { expiresAt: newExpiry });
    }

    return {
        paymentId: payment._id,
        bankTransfer: bankTransfer.buildInstructionsForAccount({
            account, windowMinutes, amount, content: orderRef,
        }),
    };
}

// Export riêng để bộ kiểm thử tích hợp gọi được ĐÚNG hàm này — không viết lại
// logic tương đương trong test, tránh trường hợp test xanh nhưng code thật sai.
exports.createTopupInstructions = createTopupInstructions;
