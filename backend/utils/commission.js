/**
 * CHIA HOA HỒNG NỀN TẢNG GIỮA KHÁCH VÀ CHỦ SÂN.
 *
 * Hoa hồng của một đơn = giá sân × tỉ lệ hoa hồng (vd 10% của 200.000đ = 20.000đ).
 * Phần này được CHIA thành hai khoản theo `customerSharePct` (0–100):
 *
 *   • serviceFee      — phần KHÁCH chịu: cộng thêm vào số tiền khách phải trả.
 *   • ownerCommission — phần CHỦ SÂN chịu: trừ vào số tiền chủ sân thực nhận.
 *
 * Ví dụ giá sân 200.000đ/giờ, hoa hồng 10%:
 *   customerSharePct = 0   (mặc định) → khách trả 200.000đ, chủ sân nhận 180.000đ, nền tảng 20.000đ
 *   customerSharePct = 50             → khách trả 210.000đ, chủ sân nhận 190.000đ, nền tảng 20.000đ
 *   customerSharePct = 100 (kiểu cũ)  → khách trả 220.000đ, chủ sân nhận 200.000đ, nền tảng 20.000đ
 *
 * Luôn: serviceFee + ownerCommission = total — nền tảng nhận đủ hoa hồng bất kể
 * chia thế nào, chỉ khác ở chỗ ai là người trả.
 */
function clamp(n, lo, hi) {
    const v = Number(n);
    if (Number.isNaN(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
}

/**
 * @param {number} amount          giá sân (tiền chủ sân niêm yết cho đơn này)
 * @param {number} ratePct         tỉ lệ hoa hồng dạng 0–100 (10 = 10%)
 * @param {number} customerSharePct phần trăm hoa hồng khách chịu, 0–100
 */
function splitCommission({ amount, ratePct, customerSharePct = 0 }) {
    const base = Math.max(0, Number(amount) || 0);
    const total = Math.round(base * clamp(ratePct, 0, 100) / 100);
    const serviceFee = Math.round(total * clamp(customerSharePct, 0, 100) / 100);
    const ownerCommission = total - serviceFee;
    return { total, serviceFee, ownerCommission, ownerNet: base - ownerCommission };
}

/** Số tiền chủ sân THỰC NHẬN từ một đơn (giá sân trừ phần hoa hồng chủ sân chịu). */
function ownerNetOf(booking) {
    return (booking.amount || 0) - (booking.ownerCommission || 0);
}

/** Tổng hoa hồng nền tảng thu trên một đơn (cả phần khách lẫn phần chủ sân chịu). */
function platformCommissionOf(booking) {
    return (booking.serviceFee || 0) + (booking.ownerCommission || 0);
}

module.exports = { splitCommission, ownerNetOf, platformCommissionOf };
