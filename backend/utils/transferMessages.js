/**
 * Nội dung thông báo của luồng ĐỔI LỊCH — hàm thuần (dễ kiểm thử, không đụng CSDL).
 *
 * Đổi lịch (T1 đổi giờ, T2 đổi sân trong cùng địa điểm) là cùng một chủ sân, nên chỉ báo chủ sân MỘT lần.
 */
const RESCHEDULE_TYPES = ['T1', 'T2'];
const isReschedule = (type) => RESCHEDULE_TYPES.includes(type);
const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

const settleLineOf = (q) => (q.settlement > 0
    ? `Bạn đã thanh toán thêm ${money(q.settlement)}.`
    : q.settlement < 0
        ? `Bạn được hoàn lại ${money(-q.settlement)}${q.refundCredit > 0 ? ` (trong đó ${money(q.refundCredit)} vào số dư khuyến mãi)` : ''}.`
        : 'Không phát sinh chi phí.');

const fromText = (t) => `${t.fromCourtName || 'sân'} ngày ${t.fromDate} lúc ${t.fromStartTime}–${t.fromEndTime}`;
const toText = (t) => `${t.toCourtName || 'sân'} ngày ${t.toDate} lúc ${t.toStartTime}–${t.toEndTime}`;

/** Thông báo gửi chủ sân khi cần họ duyệt yêu cầu đổi lịch. */
function approvalRequest(transfer, timeoutMinutes) {
    return {
        title: 'Khách xin đổi lịch',
        message: `Khách muốn đổi lượt đặt từ ${fromText(transfer)} sang ${toText(transfer)}. Vui lòng phản hồi trong ${timeoutMinutes} phút; nếu không, yêu cầu sẽ hết hạn và khách giữ nguyên lịch cũ.`,
        link: '/owner/transfers?tab=reschedule',
    };
}

/** Các thông báo khi đổi lịch hoàn tất (đã lọc người nhận rỗng). */
function completedNotifications(transfer) {
    const q = transfer.quote;
    const settleLine = settleLineOf(q);
    const fee = q.transferFee > 0 ? ` Bạn nhận phí đổi lịch ${money(q.transferFee)}.` : '';
    return [
        {
            userId: transfer.customerId, type: 'transfer', icon: '🔄',
            title: 'Đã đổi lịch thành công',
            message: `Lượt đặt của bạn tại "${transfer.toVenueName}" đã đổi từ ${fromText(transfer)} sang ${toText(transfer)}. ${settleLine}`,
            link: '/bookings',
        },
        {
            userId: transfer.toOwnerId || transfer.fromOwnerId, type: 'transfer', icon: '🔄',
            title: 'Khách đã đổi lịch',
            message: `Khách đã đổi lượt đặt tại "${transfer.toVenueName}" từ ${fromText(transfer)} sang ${toText(transfer)}. Khung giờ cũ đã mở lại để nhận khách mới.${fee}`,
            link: '/owner/bookings',
        },
    ].filter((n) => n.userId);
}

/** Thông báo cho khách khi yêu cầu không thành công (từ chối, hết hạn, lỗi). Lượt đặt gốc luôn còn nguyên. */
function failureNotification(transfer, reason, paidAmount) {
    const refundLine = paidAmount ? ` Khoản ${money(paidAmount)} đã thanh toán đang được hoàn lại.` : '';
    return {
        title: 'Yêu cầu đổi lịch không thành công',
        message: `${reason}. Lịch đặt ban đầu của bạn tại "${transfer.fromVenueName}" VẪN CÒN HIỆU LỰC.${refundLine}`,
    };
}

module.exports = { RESCHEDULE_TYPES, isReschedule, approvalRequest, completedNotifications, failureNotification };
