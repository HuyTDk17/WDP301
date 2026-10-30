const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const Notification = require('../models/Notification');

/**
 * DỊCH VỤ HOÀN TIỀN.
 *
 * Khách chuyển khoản THẲNG cho chủ sân nên mọi khoản hoàn đều do CHỦ SÂN đã
 * nhận tiền chuyển lại (ngoài hệ thống — chuyển khoản ngân hàng không có API
 * hoàn tự động), rồi bấm "Đã hoàn tiền" để đóng khoản hoàn. Quản trị viên không
 * giữ đồng nào của khách nên không hoàn và cũng không xác nhận hoàn.
 *
 * Nguyên tắc không đổi: một khoản hoàn KHÔNG BAO GIỜ bị mất dấu — luôn tồn tại
 * một bản ghi Payment ở trạng thái 'refund_requested' (chờ chủ sân) hoặc
 * 'refunded' (đã xong). Khoản chủ sân hoàn được trừ vào số dư đối soát của họ
 * (utils/settlementMath.js) nên họ không bị thiệt khi hoàn từ tiền của mình.
 */

/**
 * AI HOÀN TIỀN CHO ĐƠN ĐẶT SÂN? — chủ sân đã NHẬN tiền (payment.receiver.ownerId
 * của giao dịch gốc). Giao dịch cũ chưa có receiver: chủ sân của địa điểm.
 */
async function ownerWhoReceived(bookingId) {
    if (!bookingId) return null;
    const original = await Payment.findOne({
        bookingId, purpose: 'booking', 'receiver.ownerId': { $ne: null },
        status: { $in: ['completed', 'refund_requested', 'refunded'] },
    });
    if (original?.receiver?.ownerId) return original.receiver.ownerId;
    const booking = await Booking.findById(bookingId).select('venueId');
    const venue = booking ? await Venue.findById(booking.venueId).select('ownerId') : null;
    return venue?.ownerId || null;
}

/**
 * Tạo một khoản cần hoàn, luôn ở trạng thái 'refund_requested', giao cho chủ sân.
 * @param {object} p
 * @param {*} [p.refundOwnerId] chủ sân phải hoàn; bỏ trống thì tra theo đơn đặt sân
 */
async function createRefund({
    amount, reason, bookingId = null, transferId = null, customerId = null, prefix = 'RF', refundOwnerId = null,
}) {
    const rounded = Math.round(amount);
    if (rounded <= 0) return null;

    const ownerId = refundOwnerId || await ownerWhoReceived(bookingId);

    const refundDoc = await Payment.create({
        bookingId, transferId,
        purpose: transferId ? 'transfer_refund' : 'cancellation_refund',
        method: 'bank_transfer',
        amount: rounded,
        status: 'refund_requested',
        refundOwnerId: ownerId,
        orderRef: `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        refundReason: reason,
    });

    if (customerId) {
        await Notification.create({
            userId: customerId, type: 'payment', icon: '💸',
            title: 'Yêu cầu hoàn tiền đã được ghi nhận',
            message: `${rounded.toLocaleString('vi-VN')}đ sẽ được chủ sân chuyển khoản lại cho bạn (vì bạn đã chuyển thẳng cho chủ sân). `
                + 'Nếu quá 3 ngày làm việc chưa nhận được, hãy liên hệ chủ sân.',
            link: '/bookings',
        }).catch(() => {});
    }
    if (ownerId) {
        await Notification.create({
            userId: ownerId, type: 'payment', icon: '💸',
            title: 'Cần hoàn tiền cho khách',
            message: `${rounded.toLocaleString('vi-VN')}đ cần chuyển khoản lại cho khách (${reason}). Chuyển xong hãy bấm "Đã hoàn tiền".`,
            link: '/owner/refunds',
        }).catch(() => {});
    }

    return refundDoc;
}

module.exports = { createRefund, ownerWhoReceived };
