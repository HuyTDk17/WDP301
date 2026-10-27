const Payment = require('../models/Payment');

/**
 * GIAO DỊCH "ĐANG MỞ" CỦA MỘT ĐƠN ĐẶT SÂN.
 *
 * Một đơn đặt sân chỉ được có TỐI ĐA MỘT giao dịch chuyển khoản đang mở
 * (status 'pending' hoặc 'awaiting_confirmation'). Nếu để sinh ra hai, chủ sân
 * sẽ thấy hai dòng cho cùng một đơn: từ chối dòng này, xác nhận dòng kia → đơn
 * vẫn thành công, còn khách thì có nguy cơ chuyển tiền hai lần.
 *
 * Quy tắc được giữ ở ba lớp:
 *   1. paymentController.checkout() — dùng lại giao dịch đang mở thay vì tạo mới.
 *   2. Payment.openKey (unique, partial index) — chặn ở tầng CSDL khi hai yêu
 *      cầu cùng lúc (bấm đúp, hai tab) cùng vượt qua bước 1.
 *   3. File này — dọn các giao dịch còn treo khi đơn kết thúc.
 */

const OPEN_STATUSES = ['pending', 'awaiting_confirmation'];

/** Giao dịch đang mở của đơn (mới nhất trước), hoặc null. */
function findOpenForBooking(bookingId) {
    return Payment.findOne({
        bookingId, purpose: 'booking', status: { $in: OPEN_STATUSES },
    }).sort({ customerMarkedPaidAt: -1, createdAt: -1 });
}

/**
 * Đóng (status='failed') mọi giao dịch đang mở của đơn — dùng khi đơn đã huỷ/hết
 * hạn, hoặc khi đã có một giao dịch khác của đơn được xác nhận. KHÔNG gửi thông
 * báo và KHÔNG trả lại số dư/điểm: việc đó do nơi gọi quyết định.
 *
 * @param {object} opts
 * @param {*} [opts.exceptId] giữ nguyên giao dịch này
 * @param {string[]} [opts.onlyStatuses] chỉ đóng các trạng thái này (mặc định cả hai)
 */
async function voidOpenForBooking(bookingId, reason, { exceptId = null, onlyStatuses = OPEN_STATUSES } = {}) {
    const filter = { bookingId, purpose: 'booking', status: { $in: onlyStatuses } };
    if (exceptId) filter._id = { $ne: exceptId };
    const list = await Payment.find(filter);
    for (const p of list) {
        p.status = 'failed';
        p.refundReason = reason;
        await p.save(); // pre-save của Payment tự bỏ openKey
    }
    return list.length;
}

module.exports = { OPEN_STATUSES, findOpenForBooking, voidOpenForBooking };
