/**
 * Tra cứu CHÍNH SÁCH đổi lịch từ cấu hình nền tảng.
 * Chỉ đọc tham số và trả về tỉ lệ — không tính tiền (việc đó ở transferPricing).
 */

/**
 * Xác định loại yêu cầu. Chỉ còn ĐỔI LỊCH trong cùng một địa điểm:
 *   T1 đổi giờ cùng sân · T2 đổi sang sân khác cùng địa điểm
 * Trả về null nếu đích nằm ở địa điểm khác (không còn hỗ trợ chuyển sân).
 */
function resolveTransferType({ fromVenueId, fromCourtId, toVenueId, toCourtId }) {
    if (String(fromVenueId) !== String(toVenueId)) return null;
    return String(fromCourtId) === String(toCourtId) ? 'T1' : 'T2';
}

/** Chọn bậc phù hợp: bậc có minLeadHours LỚN NHẤT mà vẫn <= lead time. */
function pickTier(tiers, leadHours) {
    const sorted = [...(tiers || [])].sort((a, b) => b.minLeadHours - a.minLeadHours);
    return sorted.find((t) => leadHours >= t.minLeadHours) || sorted[sorted.length - 1] || null;
}

/** Tỉ lệ phí đổi lịch k, theo thời gian còn lại. */
function feeRate(settings, type, leadHours) {
    const tier = pickTier(settings.transferFeeTiers, leadHours);
    return tier ? (tier.sameVenueRate || 0) : 0;
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
        maxRefundRatio: settings.maxRefundRatio ?? 0.5,
        refundToCreditEnabled: settings.refundToCreditEnabled !== false,
    };
}

/**
 * Chủ sân đích có phải duyệt tay yêu cầu này không?
 * Có cài đặt riêng `rescheduleRequiresApproval`; để trống (null) thì theo `transferRequiresApproval`
 * (giữ nguyên hành vi cho chủ sân đã bật duyệt thủ công).
 */
function requiresOwnerApproval(venue) {
    if (typeof venue?.rescheduleRequiresApproval === 'boolean') return venue.rescheduleRequiresApproval;
    return !!venue?.transferRequiresApproval;
}

module.exports = {
    requiresOwnerApproval,
    resolveTransferType, pickTier, feeRate,
    cancellationRefundRate, buildPolicy,
};
