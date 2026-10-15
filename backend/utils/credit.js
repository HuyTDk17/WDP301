const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');

/**
 * SỐ DƯ KHUYẾN MÃI — vòng đời đầy đủ.
 *
 * ============ VÌ SAO FILE NÀY TỒN TẠI ============
 *
 * Trước đây `creditBalance` là một con đường MỘT CHIỀU: nghiệp vụ chuyển sân
 * cộng tiền vào (phần hoàn vượt trần 50%) nhưng không có bất kỳ chỗ nào trong
 * toàn hệ thống trừ nó ra. Khách bị giữ lại tiền, không tiêu được, không rút
 * được, và giao diện cũng không hiển thị. Tài liệu đặc tả (mục 9.4.4) nói rõ
 * số dư này "được dùng để trừ vào các đơn đặt sân sau" — phần đó chưa được làm.
 *
 * File này khép vòng: giữ chỗ (reserve) → tiêu (redeem) hoặc trả lại (release).
 *
 * ============ VÌ SAO PHẢI GIỮ CHỖ TRƯỚC ============
 *
 * Nếu chỉ trừ số dư vào lúc thanh toán thành công, khách có thể mở hai tab và
 * tiêu cùng một số dư cho hai đơn. Nếu trừ ngay lúc tạo đơn mà khách bỏ dở, số
 * dư biến mất vô cớ. Nên: trừ ngay khi tạo URL thanh toán (giữ chỗ), và cộng
 * trả lại nếu đơn hết hạn hoặc bị huỷ trước khi thanh toán.
 *
 * Phép trừ dùng một lệnh findOneAndUpdate có điều kiện `creditBalance >= amount`
 * nên hai request đồng thời không thể cùng thành công.
 */

/**
 * Giữ chỗ (trừ) số dư cho một đơn. Trả về số tiền thực sự giữ được — có thể
 * NHỎ HƠN số yêu cầu nếu số dư không đủ, và bằng 0 nếu không giữ được đồng nào.
 *
 * @returns {Promise<number>} số tiền đã trừ khỏi số dư
 */
async function reserve(userId, requested, { bookingId = null, note = '' } = {}) {
    const want = Math.max(0, Math.round(requested || 0));
    if (!userId || want <= 0) return 0;

    const user = await User.findById(userId).select('creditBalance');
    if (!user || !user.creditBalance) return 0;

    const amount = Math.min(want, user.creditBalance);
    if (amount <= 0) return 0;

    // Điều kiện `creditBalance: { $gte: amount }` là chốt chặn chống tiêu hai
    // lần: nếu một request khác vừa tiêu mất, lệnh này không khớp document nào.
    const updated = await User.findOneAndUpdate(
        { _id: userId, creditBalance: { $gte: amount } },
        { $inc: { creditBalance: -amount } },
        { new: true }
    ).select('creditBalance');

    if (!updated) return 0;

    await CreditTransaction.create({
        userId,
        amount: -amount,
        balanceAfter: updated.creditBalance,
        reason: 'booking_payment',
        bookingId,
        note: note || 'Dùng số dư khuyến mãi trừ vào đơn đặt sân',
    }).catch(() => {});

    return amount;
}

/**
 * Trả lại số dư đã giữ chỗ nhưng cuối cùng không dùng tới (đơn hết hạn thanh
 * toán, khách huỷ trước khi trả tiền, chuyển sân thất bại).
 */
async function release(userId, amount, { bookingId = null, note = '' } = {}) {
    const value = Math.max(0, Math.round(amount || 0));
    if (!userId || value <= 0) return 0;

    const updated = await User.findByIdAndUpdate(
        userId, { $inc: { creditBalance: value } }, { new: true }
    ).select('creditBalance');
    if (!updated) return 0;

    await CreditTransaction.create({
        userId,
        amount: value,
        balanceAfter: updated.creditBalance,
        reason: 'admin_adjust',
        bookingId,
        note: note || 'Hoàn lại số dư khuyến mãi do đơn không hoàn tất',
    }).catch(() => {});

    return value;
}

/**
 * Cộng số dư như một khoản hoàn (khác `release` ở chỗ đây là tiền hoàn thật sự
 * chứ không phải trả lại khoản đã giữ chỗ) — dùng khi huỷ đơn mà phần đã thanh
 * toán bằng số dư thì cũng phải hoàn về số dư, không hoàn ra tiền mặt.
 */
async function refund(userId, amount, { bookingId = null, transferId = null, note = '' } = {}) {
    const value = Math.max(0, Math.round(amount || 0));
    if (!userId || value <= 0) return 0;

    const updated = await User.findByIdAndUpdate(
        userId, { $inc: { creditBalance: value } }, { new: true }
    ).select('creditBalance');
    if (!updated) return 0;

    await CreditTransaction.create({
        userId,
        amount: value,
        balanceAfter: updated.creditBalance,
        reason: 'cancellation_refund',
        bookingId,
        transferId,
        note: note || 'Hoàn phần đã thanh toán bằng số dư khuyến mãi',
    }).catch(() => {});

    return value;
}

/** Số dư hiện tại, an toàn khi userId null (khách vãng lai). */
async function balanceOf(userId) {
    if (!userId) return 0;
    const user = await User.findById(userId).select('creditBalance');
    return user?.creditBalance || 0;
}

/**
 * Tách một khoản hoàn thành phần TIỀN MẶT và phần SỐ DƯ.
 *
 * Nguyên tắc: khách đã trả bằng gì thì hoàn về đúng thứ đó. Nếu đơn 315.000đ
 * được trả bằng 100.000đ số dư + 215.000đ tiền mặt, mà nay hoàn 50% (157.500đ),
 * thì hoàn tiền mặt trước tối đa bằng phần tiền mặt đã trả, phần còn lại về số
 * dư. Không bao giờ cho phép biến số dư khuyến mãi thành tiền mặt.
 */
function splitRefund(totalRefund, creditApplied, totalPaid) {
    const refundTotal = Math.max(0, Math.round(totalRefund || 0));
    const credit = Math.max(0, Math.round(creditApplied || 0));
    const paid = Math.max(0, Math.round(totalPaid || 0));

    const cashPaid = Math.max(0, paid - credit);
    const cash = Math.min(refundTotal, cashPaid);
    return { cash, credit: refundTotal - cash };
}

module.exports = { reserve, release, refund, balanceOf, splitRefund };
