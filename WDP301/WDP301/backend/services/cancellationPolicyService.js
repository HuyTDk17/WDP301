const User = require('../models/User');
const { getSettings } = require('../utils/platformSettings');
const { effectiveCancellationTiers } = require('../utils/cancellationPolicy');

/**
 * Trường chính sách hủy cần CHỤP vào lượt đặt lúc tạo đơn (spread vào Booking.create).
 * Chỉ chụp khi chủ sân đang dùng biểu RIÊNG; còn lại trả {} để lượt đặt tiếp tục dùng biểu chung hiện hành của nền tảng
 * lúc hủy — giữ nguyên hành vi cũ. Chụp để chủ sân đổi chính sách sau này không làm đổi điều kiện của khách đã đặt.
 */
async function snapshotFor(ownerId) {
    const [owner, settings] = await Promise.all([ownerId ? User.findById(ownerId).select('cancellationPolicy') : null, getSettings()]);
    const eff = effectiveCancellationTiers({ ownerPolicy: owner?.cancellationPolicy, settings });
    return eff.source === 'owner' ? { cancellationTiers: eff.tiers, cancellationPolicySource: 'owner' } : {};
}

/** Biểu đang áp dụng cho lượt đặt mới tại địa điểm của chủ sân này — dùng để HIỂN THỊ cho khách. */
async function publicPolicyFor(ownerId) {
    const [owner, settings] = await Promise.all([ownerId ? User.findById(ownerId).select('cancellationPolicy') : null, getSettings()]);
    return effectiveCancellationTiers({ ownerPolicy: owner?.cancellationPolicy, settings });
}

module.exports = { snapshotFor, publicPolicyFor };
