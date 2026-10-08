const LedgerEntry = require('../models/LedgerEntry');
const { ownerNetOf } = require('./commission');

/**
 * Ghi một hoặc nhiều bút toán vào sổ cái. Luôn truyền `session` khi gọi bên
 * trong một giao dịch, để bút toán và dữ liệu nghiệp vụ cùng sống cùng chết.
 */
async function record(entries, session = null) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean)
        .filter((e) => Number(e.amount) > 0); // bỏ qua bút toán 0đ cho sổ sạch
    if (!list.length) return [];
    return LedgerEntry.create(list, session ? { session, ordered: true } : { ordered: true });
}

/**
 * Bộ bút toán chuẩn cho MỘT đơn đặt sân được thanh toán thành công.
 * Gồm cả các khoản CHI trước đây bị bỏ qua (phí cổng, chi phí khuyến mãi) — nếu không ghi thì lợi nhuận báo cáo luôn cao hơn
 * thực tế.
 */
function bookingEntries({ booking, ownerId, payment, gatewayFee = 0 }) {
    const base = {
        bookingId: booking._id,
        paymentId: payment?._id || null,
        customerId: booking.customerId || null,
        occurredAt: new Date(),
    };
    return [
        // Chủ sân nhận giá sân TRỪ phần hoa hồng họ chịu (ownerCommission)
        { ...base, entryType: 'owner_earning', direction: 'platform_out', amount: ownerNetOf(booking), ownerId, note: 'Tiền chủ sân được nhận (đã trừ hoa hồng chủ sân chịu)' },
        // Nền tảng thu cả phần khách chịu (serviceFee) lẫn phần chủ sân chịu (ownerCommission)
        { ...base, entryType: 'booking_commission', direction: 'platform_in', amount: (booking.serviceFee || 0) + (booking.ownerCommission || 0), note: 'Hoa hồng đặt sân' },
        { ...base, entryType: 'promotion_cost', direction: 'platform_out', amount: booking.discountAmount || 0, note: `Khuyến mãi ${booking.promoCode || ''}`.trim() },
        { ...base, entryType: 'gateway_fee', direction: 'platform_out', amount: gatewayFee, note: 'Phí cổng thanh toán' },
    ];
}

/**
 * Bộ bút toán cho MỘT lượt chuyển sân hoàn tất.
 * Bốn dòng tương ứng đúng bốn bên trong đẳng thức cân đối:
 *   chủ sân mới (A2) · chủ sân cũ (C_A) · nền tảng (F2 − D2). Phí chuyển sân F_tr thuộc về chủ sân đích
 */
function transferEntries({ transfer, newBooking, quote }) {
    const base = {
        transferId: transfer._id,
        bookingId: newBooking._id,
        customerId: transfer.customerId,
        occurredAt: new Date(),
    };
    return [
        { ...base, entryType: 'owner_earning', direction: 'platform_out', amount: quote.newAmount - (quote.newOwnerCommission || 0) + (quote.transferFee || 0), ownerId: transfer.toOwnerId, note: 'Tiền chủ sân đơn mới nhận sau chuyển (đã trừ hoa hồng chủ sân chịu, đã gồm phí chuyển sân thuộc về chủ sân)' },
        { ...base, entryType: 'owner_compensation', direction: 'platform_out', amount: quote.compensation, ownerId: transfer.fromOwnerId, bookingId: transfer.fromBookingId, note: 'Bồi thường khung giờ bị chuyển đi' },
        { ...base, entryType: 'booking_commission', direction: 'platform_in', amount: Math.max(0, quote.newServiceFee + (quote.newOwnerCommission || 0) - quote.newDiscount), note: 'Hoa hồng đơn mới' },
        { ...base, entryType: 'credit_issued', direction: 'platform_out', amount: quote.refundCredit, note: 'Ghi số dư khuyến mãi cho khách' },
        { ...base, entryType: 'refund', direction: 'platform_out', amount: quote.refundCash, note: 'Hoàn tiền chênh lệch khi chuyển sân' },
    ];
}

module.exports = { record, bookingEntries, transferEntries };
