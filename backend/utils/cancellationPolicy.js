const { pickTier } = require('./transferPolicy');

/**
 * CHÍNH SÁCH HỦY DO CHỦ SÂN TỰ ĐẶT — hàm thuần.
 *
 * Mỗi chủ sân có thể đặt biểu hoàn tiền riêng (theo số giờ báo trước). Để bảo vệ khách, Admin đặt một "sàn" tối thiểu
 * (`cancellationFloorTiers`): ở MỌI thời điểm báo hủy, tỉ lệ hoàn của chủ sân phải ≥ tỉ lệ của sàn. Nghĩa là chủ sân
 * được tử tế hơn mức sàn nhưng không được khắt khe hơn. Chủ sân chưa cấu hình (hoặc bị tắt) thì dùng biểu chung của nền tảng.
 */

const MAX_TIERS = 8;
const MAX_LEAD_HOURS = 720; // 30 ngày

const pct = (r) => `${Math.round(r * 100)}%`;
const rateAt = (tiers, lead) => (pickTier(tiers, lead)?.refundRate ?? 0);

/**
 * Kiểm tra & chuẩn hóa biểu bậc thang. Trả về { tiers } (đã sắp giảm dần theo giờ) hoặc { error }.
 * Quy tắc: 1–8 bậc; giờ là số nguyên 0–720, không trùng; có bậc 0 giờ (phủ mọi trường hợp báo sát giờ);
 * tỉ lệ 0–1 tối đa 2 chữ số thập phân; báo CÀNG SỚM thì hoàn KHÔNG ÍT HƠN.
 */
function normalizeTiers(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return { error: 'Biểu hoàn tiền cần ít nhất một bậc' };
    if (raw.length > MAX_TIERS) return { error: `Biểu hoàn tiền tối đa ${MAX_TIERS} bậc` };
    const seen = new Set();
    const tiers = [];
    for (const t of raw) {
        const hours = Number(t?.minLeadHours);
        const rate = Number(t?.refundRate);
        if (!Number.isInteger(hours) || hours < 0 || hours > MAX_LEAD_HOURS) return { error: `Số giờ báo trước phải là số nguyên từ 0 đến ${MAX_LEAD_HOURS}` };
        if (!Number.isFinite(rate) || rate < 0 || rate > 1 || Math.round(rate * 100) / 100 !== rate) return { error: 'Tỉ lệ hoàn phải từ 0% đến 100% (tối đa 2 chữ số thập phân, ví dụ 0.7 = 70%)' };
        if (seen.has(hours)) return { error: `Có hai bậc cùng mốc ${hours} giờ` };
        seen.add(hours);
        tiers.push({ minLeadHours: hours, refundRate: rate });
    }
    if (!seen.has(0)) return { error: 'Cần có bậc 0 giờ (báo hủy sát giờ) để biểu phủ mọi trường hợp' };
    tiers.sort((a, b) => b.minLeadHours - a.minLeadHours);
    for (let i = 1; i < tiers.length; i += 1) {
        if (tiers[i].refundRate > tiers[i - 1].refundRate) {
            return { error: `Báo hủy càng sớm thì hoàn càng nhiều: bậc ${tiers[i - 1].minLeadHours} giờ (${pct(tiers[i - 1].refundRate)}) không được thấp hơn bậc ${tiers[i].minLeadHours} giờ (${pct(tiers[i].refundRate)})` };
        }
    }
    return { tiers };
}

/** Biểu của chủ sân có đạt sàn của nền tảng không? Trả về thông báo lỗi hoặc null. */
function meetsFloor(tiers, floorTiers) {
    if (!Array.isArray(floorTiers) || floorTiers.length === 0) return null;
    const points = [...new Set([0, ...tiers.map((t) => t.minLeadHours), ...floorTiers.map((t) => t.minLeadHours)])].sort((a, b) => b - a);
    for (const lead of points) {
        const mine = rateAt(tiers, lead);
        const floor = rateAt(floorTiers, lead);
        if (mine < floor) {
            return `Khi khách báo hủy trước ${lead} giờ, nền tảng yêu cầu hoàn tối thiểu ${pct(floor)} (bạn đang đặt ${pct(mine)})`;
        }
    }
    return null;
}

/**
 * Biểu hoàn đang áp dụng cho các lượt đặt MỚI của một chủ sân.
 * { source: 'owner' | 'platform', tiers }. Chủ sân chỉ được dùng biểu riêng khi: Admin cho phép, họ đã bật, biểu hợp lệ
 * và (quan trọng) CÒN đạt sàn hiện tại — Admin nâng sàn sau đó thì biểu cũ không đạt sẽ tự quay về biểu chung.
 */
function effectiveCancellationTiers({ ownerPolicy, settings }) {
    const platform = { source: 'platform', tiers: settings?.cancellationTiers || [] };
    if (settings?.ownerCancellationPolicyAllowed === false) return platform;
    if (!ownerPolicy?.enabled || !Array.isArray(ownerPolicy.tiers) || ownerPolicy.tiers.length === 0) return platform;
    const { tiers, error } = normalizeTiers(ownerPolicy.tiers.map((t) => ({ minLeadHours: t.minLeadHours, refundRate: t.refundRate })));
    if (error || meetsFloor(tiers, settings?.cancellationFloorTiers)) return platform;
    return { source: 'owner', tiers };
}

module.exports = { normalizeTiers, meetsFloor, effectiveCancellationTiers, MAX_TIERS, MAX_LEAD_HOURS };
