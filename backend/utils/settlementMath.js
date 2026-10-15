const { ownerNetOf } = require('./commission');

/**
 * SỐ DƯ ĐỐI SOÁT CỦA MỘT CHỦ SÂN — hàm thuần, không đụng CSDL.
 *
 * Vì khách chuyển tiền thẳng cho chủ sân, câu hỏi cần trả lời là:
 *   "chủ sân đang GIỮ bao nhiêu tiền của hệ thống, và họ ĐƯỢC HƯỞNG bao nhiêu?"
 *
 *   balance = cashHeld − refundsByOwner − entitlement − remitted + platformPaid
 *
 *   cashHeld        tiền khách đã chuyển vào tài khoản chủ sân (đặt sân + bù tiền chuyển sân đã xác nhận)
 *   refundsByOwner  tiền chủ sân đã/đang phải hoàn lại cho khách (khách huỷ, chủ sân huỷ…)
 *   entitlement     tiền chủ sân được giữ = Σ (giá sân − hoa hồng chủ sân chịu + phí chuyển sân) từng đơn
 *   remitted        tiền chủ sân đã nộp cho nền tảng (hoá đơn owner_pays đã 'paid')
 *   platformPaid    tiền nền tảng đã chuyển cho chủ sân (hoá đơn platform_pays 'paid' + phiếu chi cũ)
 *
 *   balance > 0  → chủ sân đang giữ dư, nợ nền tảng (chủ yếu là hoa hồng)
 *   balance < 0  → nền tảng nợ chủ sân (khách trả bằng số dư/khuyến mãi — các khoản
 *                  này nền tảng tài trợ nên chủ sân không nhận được tiền mặt)
 *
 * Ví dụ giá sân 200.000đ, hoa hồng 10% chủ sân chịu, khách chuyển 200.000đ:
 *   cashHeld 200.000 − entitlement 180.000 = +20.000 (chủ sân nợ nền tảng 20.000).
 * Khách dùng thêm khuyến mãi 10.000đ: cashHeld 190.000 → +10.000 (nền tảng gánh 10.000).
 *
 * Công thức cộng dồn theo toàn bộ lịch sử nên huỷ đơn, chuyển sân hay trả tiền
 * giữa chừng đều tự khớp — không phải cắt kỳ hay đối chiếu từng khoản.
 */

/** Số tiền chủ sân được GIỮ từ một lượt đặt, theo trạng thái hiện tại của nó. */
function entitlementOfBooking(b) {
    // Đơn chủ sân tự tạo (thu tiền tại quầy, ngoài hệ thống): hệ thống chưa từng
    // nhận hay giữ đồng nào nên không có gì để đối soát.
    if (b.paymentMethod === 'manual') return 0;

    switch (b.status) {
        case 'confirmed':
        case 'completed':
        case 'no_show': // khách không đến vẫn mất tiền, chủ sân giữ như đơn đã hoàn tất
            // + phí chuyển sân: khách trả thẳng cho chủ sân và thuộc về chủ sân (không tính hoa hồng)
            return ownerNetOf(b) + (b.transferFeeAmount || 0);

        // Đơn đã chuyển đi: chủ sân chỉ còn được khoản bồi thường; phần còn lại của
        // số tiền khách trả quay về nền tảng để chia cho chủ sân mới.
        case 'transferred':
            return b.compensationAmount || 0;

        case 'cancelled': {
            // Chỉ đơn ĐÃ thanh toán rồi mới huỷ mới có khoản chủ sân giữ lại
            // (huỷ sát giờ). Đơn huỷ lúc chưa trả tiền: không có gì.
            const refunded = (b.refundAmount || 0) + (b.refundCreditAmount || 0);
            const wasPaid = refunded > 0 || (b.cancellationFee || 0) > 0;
            if (!wasPaid || !(b.amount > 0)) return 0;
            const keeps = Math.max(0, b.amount - refunded);
            // Hoa hồng chủ sân chịu tính theo tỉ lệ phần họ giữ lại
            const commissionShare = Math.round((b.ownerCommission || 0) * keeps / b.amount);
            return keeps - commissionShare + (b.transferFeeAmount || 0);
        }

        default: // awaiting_payment, pending
            return 0;
    }
}

const sum = (list, pick) => (list || []).reduce((s, x) => s + (pick(x) || 0), 0);

/**
 * @param {object} d
 * @param {object[]} d.bookings        mọi lượt đặt thuộc các địa điểm của chủ sân
 * @param {object[]} d.cashPayments    giao dịch đặt sân/bù chuyển sân đã nhận (completed | đang/đã hoàn) có receiver.ownerId = chủ sân
 * @param {object[]} d.ownerRefunds    khoản hoàn do chủ sân thực hiện (refund_requested | refunded), mọi loại
 * @param {object[]} d.settlements     hoá đơn đối soát của chủ sân (mọi trạng thái)
 * @param {object[]} d.payouts         phiếu chi cũ (nền tảng → chủ sân) trước khi có đối soát
 */
function balanceFromData({ bookings, cashPayments, ownerRefunds, settlements, payouts }) {
    const cashHeld = sum(cashPayments, (p) => p.amount);
    const refundsByOwner = sum(ownerRefunds, (p) => p.amount);
    const entitlement = sum(bookings, entitlementOfBooking);

    const paid = (settlements || []).filter((s) => s.status === 'paid');
    const remitted = sum(paid.filter((s) => s.direction === 'owner_pays'), (s) => s.amount);
    const platformPaid = sum(paid.filter((s) => s.direction === 'platform_pays'), (s) => s.amount)
        + sum(payouts, (p) => p.amount);

    const balance = cashHeld - refundsByOwner - entitlement - remitted + platformPaid;
    const counted = (bookings || []).filter((b) => entitlementOfBooking(b) > 0).length;

    return {
        balance,
        ownerOwesPlatform: Math.max(0, balance),
        platformOwesOwner: Math.max(0, -balance),
        cashHeld, refundsByOwner, entitlement, remitted, platformPaid,
        bookingCount: counted,
    };
}

module.exports = { entitlementOfBooking, balanceFromData };
