const User = require('../models/User');

/**
 * MẠNG LƯỚI CHUYỂN SÂN — quy tắc thành viên.
 *
 * Chỉ áp dụng cho chuyển sang CHỦ SÂN KHÁC (loại T4). Đổi giờ / đổi sân / chuyển giữa các địa điểm của CÙNG một
 * chủ sân (T1–T3) và sang tên (T5) không cần là thành viên. Khi Admin chưa bật `transferNetworkRequired`
 * (mặc định) mọi chủ sân đều được tính là thành viên — hành vi cũ giữ nguyên.
 */

/** Chủ sân có được tính là thành viên mạng lưới không? */
async function ownerInNetwork(ownerId, settings) {
    if (!settings?.transferNetworkRequired) return true;
    if (!ownerId) return false;
    const owner = await User.findById(ownerId).select('transferNetwork');
    return owner?.transferNetwork?.status === 'approved';
}

/**
 * Trả về thông báo lỗi nếu chuyển loại T4 bị chặn do thiếu tư cách thành viên, ngược lại null.
 * Cần CẢ HAI bên: chủ sân hiện tại (nơi khách đang đặt) và chủ sân đích.
 */
async function crossOwnerBlocker({ type, fromOwnerId, toOwnerId, settings }) {
    if (type !== 'T4' || !settings?.transferNetworkRequired) return null;
    const [fromOk, toOk] = await Promise.all([ownerInNetwork(fromOwnerId, settings), ownerInNetwork(toOwnerId, settings)]);
    if (!fromOk) return 'Chủ sân hiện tại của lượt đặt chưa tham gia mạng lưới chuyển sân nên chưa thể chuyển sang chủ sân khác. Bạn vẫn có thể đổi giờ hoặc chuyển trong cùng chủ sân.';
    if (!toOk) return 'Chủ sân của địa điểm này chưa tham gia mạng lưới chuyển sân. Vui lòng chọn địa điểm khác.';
    return null;
}

module.exports = { ownerInNetwork, crossOwnerBlocker };
