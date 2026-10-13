/**
 * Liên kết mở khung chat Zalo theo số điện thoại: https://zalo.me/<số>.
 * Số điện thoại của hệ thống luôn là 10 chữ số dạng 0xxxxxxxxx (User.phone); cũng nhận dạng 84xxxxxxxxx.
 * Trả về chuỗi rỗng nếu số không hợp lệ (frontend sẽ không hiện nút Zalo).
 * Lưu ý: chat được hay không còn tùy cài đặt Zalo của người nhận (cho phép tìm bằng số điện thoại).
 */
function zaloUrl(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    const local = digits.startsWith('84') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
    return /^0\d{9}$/.test(local) ? `https://zalo.me/${local}` : '';
}

/** Thông tin liên lạc chỉ trả ra SAU KHI hai bên đã được ghép (xem playerController). */
function contactOf(user) {
    return { name: user?.name || '', phone: user?.phone || '', zaloUrl: zaloUrl(user?.phone) };
}

module.exports = { zaloUrl, contactOf };
