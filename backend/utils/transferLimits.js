const TransferRequest = require('../models/TransferRequest');

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 00:00 ngày 1 của THÁNG HIỆN TẠI theo giờ Việt Nam, trả về dạng Date (UTC). */
function monthStartVN(now = new Date()) {
    const vn = new Date(now.getTime() + VN_OFFSET_MS);
    return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - VN_OFFSET_MS);
}

/**
 * Số lượt đổi lịch / chuyển sân ĐÃ HOÀN TẤT của khách trong tháng hiện tại (giờ Việt Nam).
 * Không tính sang tên (T5) vì không đổi sân/khung giờ. Yêu cầu bỏ dở, hết hạn hay bị từ chối không tính.
 */
async function transfersUsedThisMonth(customerId, now = new Date()) {
    return TransferRequest.countDocuments({
        customerId, status: 'completed', type: { $ne: 'T5' }, completedAt: { $gte: monthStartVN(now) },
    });
}

/** { limit, used, reached } — limit 0 = không giới hạn. */
async function monthlyStatus(customerId, settings, now = new Date()) {
    const limit = Number(settings?.maxTransfersPerMonth) || 0;
    if (limit <= 0) return { limit: 0, used: 0, reached: false };
    const used = await transfersUsedThisMonth(customerId, now);
    return { limit, used, reached: used >= limit };
}

module.exports = { monthStartVN, transfersUsedThisMonth, monthlyStatus };
