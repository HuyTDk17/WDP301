const Booking = require('../models/Booking');
const Hold = require('../models/Hold');
const User = require('../models/User');
const Payment = require('../models/Payment');
const TransferRequest = require('../models/TransferRequest');
const transferService = require('../services/transferService');
const credit = require('../utils/credit');
const { getSettings } = require('../utils/platformSettings');
const { voidOpenForBooking } = require('../utils/openPayments');
const settlementService = require('../services/settlementService');

/**
 * TÁC VỤ NỀN.
 *
 * TTL index của MongoDB đủ để dọn bản ghi giữ chỗ, nhưng KHÔNG đủ để đóng đơn
 * chờ thanh toán quá hạn hay hết hạn báo giá chuyển sân — những việc đó cần
 * chạy logic nghiệp vụ (hoàn tiền, trả lại số dư, gửi thông báo) chứ không chỉ
 * xoá document.
 *
 * ============ QUAN TRỌNG SAU KHI ĐỔI SANG CHUYỂN KHOẢN NGÂN HÀNG ============
 *
 * Với VNPay/MoMo, "chờ thanh toán quá X phút" đồng nghĩa "khách đã bỏ dở" —
 * cổng xác nhận gần như tức thời nên không có vùng xám. Với chuyển khoản ngân
 * hàng thì có: khách có thể đã chuyển khoản xong nhưng quản trị viên chưa kịp
 * đối chiếu sao kê. Nếu vẫn tự huỷ theo giờ như cũ, một đơn ĐÃ ĐƯỢC THANH TOÁN
 * có thể bị huỷ nhầm trong lúc chờ xác nhận.
 *
 * Giải pháp: MỘT KHI khách đã bấm "Tôi đã chuyển khoản" (Payment chuyển sang
 * 'awaiting_confirmation'), tuyệt đối không tự huỷ nữa — chỉ huỷ những đơn mà
 * Payment vẫn còn 'pending' (khách chưa từng báo là đã chuyển).
 *
 * ⚠️ CHỈ MỘT TIẾN TRÌNH ĐƯỢC CHẠY tác vụ này. Khi scale nhiều instance, đặt
 * RUN_JOBS=false ở tất cả trừ một (xem server.js).
 */

/**
 * Huỷ các đơn chờ thanh toán đã quá hạn — NGOẠI TRỪ đơn có giao dịch đang chờ
 * chủ sân xác nhận — trả khung giờ về trạng thái trống, và TRẢ LẠI phần
 * số dư khuyến mãi đã giữ chỗ.
 */
async function expireStaleBookings() {
    const settings = await getSettings();
    const windowMinutes = settings.bankTransferWindowMinutes || 30;
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

    const candidates = await Booking.find({
        status: 'awaiting_payment', createdAt: { $lt: cutoff },
    }).limit(300);

    let count = 0;
    for (const booking of candidates) {
        // Khách đã báo "đã chuyển khoản" — đang chờ quản trị viên đối chiếu.
        // KHÔNG được tự huỷ, tiền có thể đã thực sự về.
        const awaitingConfirmation = await Payment.exists({
            bookingId: booking._id, status: 'awaiting_confirmation',
        });
        if (awaitingConfirmation) continue;

        try {
            if (booking.creditApplied > 0) {
                await credit.release(booking.customerId, booking.creditApplied, {
                    bookingId: booking._id,
                    note: 'Hoàn lại số dư do đơn quá hạn thanh toán',
                });
                booking.creditApplied = 0;
            }
            booking.status = 'cancelled';
            booking.cancellationReason = 'Quá hạn thanh toán';
            await booking.save();
            // Giao dịch còn 'pending' (khách chưa bấm đã chuyển) không còn ý nghĩa
            await voidOpenForBooking(booking._id, 'Đơn quá hạn thanh toán').catch(() => {});
            count += 1;
        } catch (err) {
            console.error('expireStaleBookings', booking._id.toString(), err.message);
        }
    }

    return count;
}

/**
 * Đóng các yêu cầu chuyển sân hết hạn báo giá hoặc hết hạn chờ chủ sân duyệt —
 * NGOẠI TRỪ yêu cầu có khoản bù đang chờ xác nhận chuyển khoản, cùng lý do như
 * expireStaleBookings ở trên.
 */
async function expireStaleTransfers() {
    const stale = await TransferRequest.find({
        status: { $in: ['quoted', 'awaiting_payment', 'awaiting_owner_approval'] },
        quoteExpiresAt: { $lt: new Date() },
    }).limit(100);

    let count = 0;
    for (const transfer of stale) {
        if (transfer.status === 'awaiting_payment' && transfer.paymentId) {
            const awaitingConfirmation = await Payment.exists({
                _id: transfer.paymentId, status: 'awaiting_confirmation',
            });
            if (awaitingConfirmation) continue;
        }

        const reason = transfer.status === 'awaiting_owner_approval'
            ? 'Chủ sân không phản hồi trong thời hạn quy định'
            : transfer.status === 'awaiting_payment'
                ? 'Bạn chưa hoàn tất chuyển khoản khoản chênh lệch trong thời hạn quy định'
                : 'Báo giá đã hết hạn';
        try {
            await transferService.expire(transfer, reason);
            count += 1;
        } catch (err) {
            console.error('expireTransfer', transfer._id.toString(), err.message);
        }
    }
    return count;
}

/** Dọn bản ghi giữ chỗ đã dùng xong — TTL index chỉ xoá bản ghi HẾT HẠN. */
async function cleanConsumedHolds() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r = await Hold.deleteMany({ consumed: true, createdAt: { $lt: cutoff } });
    return r.deletedCount || 0;
}

/**
 * Xoá mã đặt lại mật khẩu đã hết hạn. Không xoá tài khoản nên không dùng được
 * TTL index; mã hết hạn nằm lại trong cơ sở dữ liệu chỉ làm tăng bề mặt tấn công.
 */
async function cleanExpiredResetTokens() {
    const r = await User.updateMany(
        { resetPasswordExpires: { $lt: new Date() } },
        { $set: { resetPasswordTokenHash: null, resetPasswordExpires: null } }
    );
    return r.modifiedCount || 0;
}

async function runOnce() {
    const [bookings, transfers] = await Promise.all([
        expireStaleBookings().catch((e) => { console.error('expireStaleBookings', e.message); return 0; }),
        expireStaleTransfers().catch((e) => { console.error('expireStaleTransfers', e.message); return 0; }),
    ]);
    if (bookings || transfers) {
        console.log(`🧹 Dọn dẹp: ${bookings} đơn quá hạn thanh toán, ${transfers} yêu cầu chuyển sân hết hạn`);
    }
}

async function runHourly() {
    // Đầu tháng: lập hoá đơn đối soát hoa hồng cho chủ sân (tự giới hạn một lần/ngày)
    await settlementService.autoIssueMonthly().catch((e) => console.error('autoIssueMonthly', e.message));
    await settlementService.sendFeeReminders().catch((e) => console.error('sendFeeReminders', e.message));
    await cleanConsumedHolds().catch(() => {});
    await cleanExpiredResetTokens().catch(() => {});
}

function start(intervalMs = 60 * 1000) {
    runOnce();
    const timer = setInterval(runOnce, intervalMs);
    const hourly = setInterval(runHourly, 60 * 60 * 1000);
    timer.unref?.(); hourly.unref?.();
    console.log('⏱️  Đã bật tác vụ nền (đóng đơn quá hạn, hết hạn yêu cầu chuyển sân)');
    return () => { clearInterval(timer); clearInterval(hourly); };
}

module.exports = {
    start, runOnce, runHourly,
    expireStaleBookings, expireStaleTransfers, cleanConsumedHolds, cleanExpiredResetTokens,
};
