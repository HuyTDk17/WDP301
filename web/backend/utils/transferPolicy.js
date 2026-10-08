/**
 * Tra cứu CHÍNH SÁCH chuyển sân từ cấu hình nền tảng.
 * Chỉ đọc tham số và trả về tỉ lệ — không tính tiền (việc đó ở transferPricing).
 */

const SAME_VENUE_TYPES = ['T1', 'T2'];

/**
 * Xác định loại chuyển từ hai cặp (venue, owner).
 *   T1 đổi giờ cùng sân · T2 đổi sân cùng địa điểm
 *   T3 khác địa điểm nhưng cùng chủ · T4 khác chủ sân
 */
function resolveTransferType({ fromVenueId, fromCourtId, fromOwnerId, toVenueId, toCourtId, toOwnerId }) {
    const sameVenue = String(fromVenueId) === String(toVenueId);
    const sameCourt = String(fromCourtId) === String(toCourtId);
    if (sameVenue && sameCourt) return 'T1';
    if (sameVenue) return 'T2';
    if (String(fromOwnerId) === String(toOwnerId)) return 'T3';
    return 'T4';
}

/** Chọn bậc phù hợp: bậc có minLeadHours LỚN NHẤT mà vẫn <= lead time. */
function pickTier(tiers, leadHours) {
    const sorted = [...(tiers || [])].sort((a, b) => b.minLeadHours - a.minLeadHours);
    return sorted.find((t) => leadHours >= t.minLeadHours) || sorted[sorted.length - 1] || null;
}

/** Tỉ lệ phí chuyển sân k, theo loại chuyển và thời gian còn lại. */
function feeRate(settings, type, leadHours) {
    if (type === 'T5') return 0; // T5 dùng phí cố định, không theo tỉ lệ
    const tier = pickTier(settings.transferFeeTiers, leadHours);
    if (!tier) return 0;
    if (SAME_VENUE_TYPES.includes(type)) return tier.sameVenueRate || 0;
    if (type === 'T3') return tier.sameOwnerRate || 0;
    return tier.crossOwnerRate || 0;
}

/**
 * Tỉ lệ bồi thường c cho chủ sân GỐC.
 * Chỉ khác 0 với T4: các loại còn lại doanh thu vẫn nằm trong tay chính chủ
 * sân đó, không ai bị thiệt nên không có gì để đền.
 */
function compensationRate(settings, type, leadHours) {
    if (type !== 'T4') return 0;
    const tier = pickTier(settings.compensationTiers, leadHours);
    return tier ? (tier.rate || 0) : 0;
}

/** Tỉ lệ hoàn tiền khi huỷ đơn, theo thời gian còn lại. */
function cancellationRefundRate(settings, leadHours) {
    const tier = pickTier(settings.cancellationTiers, leadHours);
    return tier ? (tier.refundRate || 0) : 0;
}

/** Gói chính sách thành đối tượng để truyền vào transferPricing (hàm thuần). */
function buildPolicy(settings, type, leadHours) {
    return {
        type,
        leadHours,
        feeRate: feeRate(settings, type, leadHours),
        feeMin: settings.transferFeeMin ?? 5000,
        feeMax: settings.transferFeeMax ?? 100000,
        fixedFeeT5: settings.transferFixedFeeT5 ?? 10000,
        compensationRate: compensationRate(settings, type, leadHours),
        maxRefundRatio: settings.maxRefundRatio ?? 0.5,
        refundToCreditEnabled: settings.refundToCreditEnabled !== false,
    };
}

module.exports = {
    resolveTransferType, pickTier, feeRate, compensationRate,
    cancellationRefundRate, buildPolicy,
};
