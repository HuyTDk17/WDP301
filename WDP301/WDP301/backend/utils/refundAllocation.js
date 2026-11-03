const { splitRefund } = require('./credit');

/**
 * Tách một khoản hoàn thành BA phần: tiền mặt, số dư khuyến mãi, điểm tích luỹ.
 *
 * Nguyên tắc không đổi từ `credit.splitRefund`: khách đã trả bằng gì thì hoàn
 * về đúng thứ đó, không bao giờ để số dư/điểm (vốn là chi phí nội bộ nền tảng
 * tự nguyện cấp) biến thành tiền mặt thật.
 *
 * Thứ tự ưu tiên khi hoàn phần "phi tiền mặt": số dư khuyến mãi trước, điểm
 * tích luỹ sau — không có ý nghĩa nghiệp vụ đặc biệt, chỉ cần NHẤT QUÁN một
 * chiều để tổng luôn khớp và không có phần nào bị âm.
 *
 * @returns {{cash: number, credit: number, points: number}} — points ở đây
 *          là GIÁ TRỊ VNĐ được hoàn về điểm, chưa quy đổi ngược ra số điểm.
 *          Gọi `loyaltyPoints.vndToPoints()` trước khi cộng lại cho user.
 */
function splitRefundThreeWay({ refundAmount, paidTotal, creditApplied, pointsValueApplied }) {
    const credit = Math.max(0, Math.round(creditApplied || 0));
    const pointsValue = Math.max(0, Math.round(pointsValueApplied || 0));
    const nonCash = credit + pointsValue;

    // Tái dùng hàm 2 chiều đã có: coi (số dư + điểm) như MỘT khối phi tiền mặt.
    const { cash, credit: nonCashRefund } = splitRefund(refundAmount, nonCash, paidTotal);

    // Trong phần phi tiền mặt, ưu tiên trả về số dư trước (đã có từ trước khi
    // có tính năng điểm), phần dư mới trả về điểm.
    const creditPortion = Math.min(nonCashRefund, credit);
    const pointsPortion = nonCashRefund - creditPortion;

    return { cash, credit: creditPortion, points: pointsPortion };
}

module.exports = { splitRefundThreeWay };
