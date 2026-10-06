const User = require('../models/User');
const Notification = require('../models/Notification');
const { getPointsPerAmount, getSettings } = require('./platformSettings');

// Cộng điểm tích lũy cho khách hàng khi 1 booking được xác nhận thanh toán
// thành công. Chỉ áp dụng cho booking có customerId (tài khoản thật) — booking
// thủ công của chủ sân (khách vãng lai, không có customerId) không tích điểm
// được vì không biết cộng vào tài khoản nào.
async function awardPointsForBooking(booking) {
    if (!booking.customerId) return 0;

    const pointsPerAmount = await getPointsPerAmount();
    if (!pointsPerAmount || pointsPerAmount <= 0) return 0;

    const totalPaid = (booking.amount || 0) + (booking.serviceFee || 0);
    const points = Math.floor(totalPaid / pointsPerAmount);
    if (points <= 0) return 0;

    const user = await User.findByIdAndUpdate(
        booking.customerId,
        { $inc: { loyaltyPoints: points } },
        { new: true }
    );
    if (!user) return 0;

    await Notification.create({
        userId: booking.customerId,
        type: 'loyalty_points',
        icon: '🎁',
        title: `Bạn vừa nhận được ${points} điểm tích lũy`,
        message: `Cảm ơn bạn đã đặt sân "${booking.venueName || ''}"! Bạn hiện có ${user.loyaltyPoints} điểm.`,
        link: '/profile',
    });

    return points;
}

// ============================================================
// TIÊU ĐIỂM TÍCH LUỸ.
//
// Trước đây điểm chỉ có MỘT CHIỀU: cộng khi thanh toán, trừ lại khi chuyển
// sân sang đơn rẻ hơn (transferService.adjustLoyalty) — không có chỗ nào để
// chủ động TIÊU điểm. Phần dưới đây khép vòng đời, theo đúng khuôn mẫu đã
// dùng cho số dư khuyến mãi ở utils/credit.js: giữ chỗ lúc checkout → trừ
// thật khi thanh toán xong → trả lại nếu đơn không hoàn tất.
//
// Vì sao cần GIỮ CHỖ trước thay vì trừ thẳng: nếu chỉ trừ lúc thanh toán
// thành công, khách có thể mở hai tab và tiêu cùng một số điểm cho hai đơn.
// ============================================================

/** Giá trị quy đổi ra VNĐ của N điểm, theo tỉ giá hiện hành. */
function pointsToVnd(points, settings) {
    return Math.round((Number(points) || 0) * (settings.pointValueVnd || 0));
}

/**
 * Số điểm cần dùng để có đúng (hoặc gần nhất, KHÔNG VƯỢT QUÁ) `vnd` đồng.
 * Luôn làm tròn XUỐNG — thà đơn còn dư vài trăm đồng phải trả bằng tiền mặt,
 * còn hơn trừ điểm nhiều hơn giá trị khách thực sự được giảm.
 */
function vndToPoints(vnd, settings) {
    if (!settings.pointValueVnd || settings.pointValueVnd <= 0) return 0;
    return Math.max(0, Math.floor((Number(vnd) || 0) / settings.pointValueVnd));
}

/**
 * Giữ chỗ (trừ) điểm cho một đơn. `requestedVnd` là giá trị TỐI ĐA muốn dùng
 * điểm để giảm — hàm tự cắt theo số điểm khách thực sự có VÀ theo trần
 * `pointsRedeemMaxRatio` (đã được caller tính sẵn vào requestedVnd).
 *
 * @returns {Promise<{points: number, valueVnd: number}>} số điểm và giá trị
 *          đã thực sự trừ được — có thể ít hơn yêu cầu nếu không đủ điểm.
 */
async function reserve(userId, requestedVnd, settings, { bookingId = null, note = '' } = {}) {
    const wantVnd = Math.max(0, Math.round(requestedVnd || 0));
    if (!userId || wantVnd <= 0) return { points: 0, valueVnd: 0 };

    const wantPoints = vndToPoints(wantVnd, settings);
    if (wantPoints <= 0) return { points: 0, valueVnd: 0 };

    const user = await User.findById(userId).select('loyaltyPoints');
    if (!user || !user.loyaltyPoints) return { points: 0, valueVnd: 0 };

    const points = Math.min(wantPoints, user.loyaltyPoints);
    if (points <= 0) return { points: 0, valueVnd: 0 };

    // Điều kiện `loyaltyPoints: { $gte: points }` là chốt chặn chống tiêu hai
    // lần — giống hệt cơ chế của utils/credit.js.
    const updated = await User.findOneAndUpdate(
        { _id: userId, loyaltyPoints: { $gte: points } },
        { $inc: { loyaltyPoints: -points } },
        { new: true }
    ).select('loyaltyPoints');

    if (!updated) return { points: 0, valueVnd: 0 };

    return { points, valueVnd: pointsToVnd(points, settings) };
}

/** Trả lại điểm đã giữ chỗ nhưng không dùng tới (đơn hết hạn/huỷ trước khi trả tiền). */
async function release(userId, points, { note = '' } = {}) {
    const value = Math.max(0, Math.round(points || 0));
    if (!userId || value <= 0) return 0;
    await User.updateOne({ _id: userId }, { $inc: { loyaltyPoints: value } });
    return value;
}

/**
 * Hoàn lại điểm khi huỷ một đơn ĐÃ thanh toán một phần bằng điểm — khác
 * `release` ở chỗ đây là một khoản HOÀN thật (đơn đã hoàn tất, không phải chỉ
 * đang giữ chỗ dở dang).
 */
async function refund(userId, points, { note = '' } = {}) {
    const value = Math.max(0, Math.round(points || 0));
    if (!userId || value <= 0) return 0;
    await User.updateOne({ _id: userId }, { $inc: { loyaltyPoints: value } });
    return value;
}

/** Số điểm TỐI ĐA được dùng để giảm cho một đơn có tổng giá trị `grossPayable`. */
async function maxRedeemableVnd(grossPayable) {
    const settings = await getSettings();
    const ratio = settings.pointsRedeemMaxRatio ?? 0.5;
    return Math.floor((grossPayable || 0) * ratio);
}

module.exports = {
    awardPointsForBooking,
    pointsToVnd, vndToPoints, reserve, release, refund, maxRedeemableVnd,
};
