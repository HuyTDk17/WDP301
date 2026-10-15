/**
 * LÕI TÍNH PHÍ CHUYỂN SÂN — hàm THUẦN, không chạm cơ sở dữ liệu.
 *
 * Tách riêng vì đây là phần dễ sai nhất và cũng là phần cần kiểm thử kỹ nhất:
 * một sai sót nhỏ trong công thức sẽ gây sai lệch tài chính tích luỹ và rất
 * khó phát hiện bằng mắt. Ở dạng hàm thuần, toàn bộ kịch bản có thể kiểm thử
 * trong vài mili giây mà không cần dựng cơ sở dữ liệu.
 *
 * ============ CÔNG THỨC CHÍNH ============
 *
 *      S = P2 + F_tr + C_A − P1
 *
 *   P1   = A1 + F1 − D1        đã trả cho đơn gốc
 *   P2   = A2 + F2 − D2        phải trả cho đơn mới
 *   F_tr = clamp(round(A1 × k), feeMin, feeMax)      phí chuyển sân
 *   C_A  = round(A1 × c)                             bồi thường chủ sân cũ
 *
 *   S > 0 → khách bù thêm · S = 0 → chuyển ngay · S < 0 → khách được hoàn
 *
 * Diễn giải: khách trả tiền hàng mới (P2), trả phí đổi hàng (F_tr), đền cho
 * người bán cũ bị lỡ hàng (C_A), và được trừ đi số đã trả trước đó (P1).
 */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * @param {object} input
 *   oldAmount, oldServiceFee, oldDiscount — số liệu ĐÃ CHỐT của đơn gốc
 *   newAmount, newServiceFee, newDiscount — số liệu đơn mới, tính lại tại đây
 * @param {object} policy  kết quả của transferPolicy.buildPolicy()
 */
function quoteTransfer(input, policy) {
    const oldAmount = Math.round(input.oldAmount || 0);
    const oldServiceFee = Math.round(input.oldServiceFee || 0);
    const oldDiscount = Math.round(input.oldDiscount || 0);
    const newAmount = Math.round(input.newAmount || 0);
    const newServiceFee = Math.round(input.newServiceFee || 0);
    const newDiscount = Math.round(input.newDiscount || 0);

    const oldPaid = oldAmount + oldServiceFee - oldDiscount;
    const newPayable = newAmount + newServiceFee - newDiscount;

    // --- Phí chuyển sân ---
    const k = policy.type === 'T5' ? 0 : (policy.feeRate || 0);
    const transferFee = policy.type === 'T5'
        ? Math.round(policy.fixedFeeT5 || 0)
        // Chặn dưới để khoản thu đủ bù chi phí giao dịch, chặn trên để đơn giá
        // trị lớn không phải chịu mức phí vô lý. Phí 0% thì miễn hẳn, không bị
        // sàn kéo lên — nếu không thì "miễn phí" sẽ hoá ra vẫn mất 5.000đ.
        : (k <= 0 ? 0 : clamp(Math.round(oldAmount * k), policy.feeMin || 0, policy.feeMax || Infinity));

    // --- Bồi thường chủ sân gốc ---
    const c = policy.compensationRate || 0;
    const compensation = Math.round(oldAmount * c);

    // --- Quyết toán ---
    const settlement = newPayable + transferFee + compensation - oldPaid;

    // --- Chia phần hoàn thành tiền mặt và số dư khuyến mãi ---
    let refundCash = 0;
    let refundCredit = 0;
    if (settlement < 0) {
        const total = -settlement;
        const cashCap = Math.round(oldPaid * (policy.maxRefundRatio ?? 1));
        refundCash = Math.min(total, cashCap);
        refundCredit = total - refundCash;
        // Nếu không bật số dư khuyến mãi thì hoàn hết bằng tiền mặt.
        if (!policy.refundToCreditEnabled) {
            refundCash = total;
            refundCredit = 0;
        }
    }

    return {
        leadTimeHours: Math.round((policy.leadHours || 0) * 100) / 100,
        oldAmount, oldServiceFee, oldDiscount, oldPaid,
        newAmount, newServiceFee, newDiscount, newPayable,
        transferFeeRate: k, transferFee,
        compensationRate: c, compensation,
        settlement,
        direction: settlement > 0 ? 'topup' : settlement < 0 ? 'refund' : 'none',
        refundCash, refundCredit,
    };
}

/**
 * KIỂM TRA ĐẲNG THỨC CÂN ĐỐI — bắt buộc chạy trước khi ghi sổ cái.
 *
 *   Khách chi = P1 + S = P2 + F_tr + C_A
 *   Các bên nhận = A2 (chủ mới) + C_A (chủ cũ) + (F2 − D2 + F_tr) (nền tảng)
 *
 * Hai vế phải bằng nhau TUYỆT ĐỐI. Lệch dù một đồng cũng có nghĩa là công thức
 * sai ở đâu đó, và thà huỷ giao dịch còn hơn ghi sổ sai.
 */
function verifyBalance(q) {
    const customerPays = q.oldPaid + q.settlement;
    const distributed = q.newAmount + q.compensation + (q.newServiceFee - q.newDiscount) + q.transferFee;
    return { balanced: customerPays === distributed, customerPays, distributed, diff: customerPays - distributed };
}

/** Dựng các dòng hiển thị cho giao diện — máy chủ quyết định, client chỉ vẽ. */
function buildBreakdown(q, labels = {}) {
    const rows = [
        { label: labels.newAmount || 'Tiền sân mới', amount: q.newAmount },
        { label: labels.newServiceFee || 'Phí dịch vụ', amount: q.newServiceFee },
    ];
    if (q.newDiscount > 0) rows.push({ label: 'Giảm giá', amount: -q.newDiscount });
    if (q.transferFee > 0) {
        rows.push({
            label: q.transferFeeRate > 0
                ? `Phí chuyển sân (${Math.round(q.transferFeeRate * 100)}%)`
                : 'Phí chuyển sân',
            amount: q.transferFee,
        });
    }
    if (q.compensation > 0) {
        rows.push({
            label: `Bồi thường chủ sân cũ (${Math.round(q.compensationRate * 100)}%)`,
            amount: q.compensation,
        });
    }
    rows.push({ label: 'Đã thanh toán trước đó', amount: -q.oldPaid });
    rows.push({
        label: q.settlement > 0 ? 'Bạn cần thanh toán thêm'
            : q.settlement < 0 ? 'Bạn được hoàn lại' : 'Không phát sinh chi phí',
        amount: q.settlement,
        emphasis: true,
    });
    return rows;
}

module.exports = { quoteTransfer, verifyBalance, buildBreakdown, clamp };
