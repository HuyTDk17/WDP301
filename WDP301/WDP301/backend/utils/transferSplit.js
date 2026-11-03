/**
 * CHIA PHÍ CHUYỂN SÂN GIỮA HAI CHỦ SÂN — hàm thuần.
 *
 * Hiện nay toàn bộ phí chuyển sân thuộc về chủ sân của đơn MỚI (nơi khách chuyển đến). Với chuyển sang CHỦ SÂN KHÁC
 * (T4), Admin có thể đặt `transferFeeOriginSharePct`: chủ sân GỐC (người bị mất lượt đặt) nhận thêm phần trăm đó của phí,
 * bên cạnh khoản bồi thường theo bậc. Các loại chuyển khác (cùng chủ sân, sang tên) không chia — chỉ một chủ sân liên quan.
 *
 * Phần chia luôn được làm tròn xuống số nguyên và không bao giờ vượt quá phí, nên phần còn lại của chủ sân đích không âm.
 */
function originFeeShare({ type, transferFee, pct }) {
    if (type !== 'T4') return 0;
    const fee = Math.max(0, Math.round(Number(transferFee) || 0));
    const p = Math.min(100, Math.max(0, Number(pct) || 0));
    return Math.min(fee, Math.floor((fee * p) / 100));
}

module.exports = { originFeeShare };
