const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { getSettings } = require('../utils/platformSettings');
const { normalizeTiers, meetsFloor, effectiveCancellationTiers } = require('../utils/cancellationPolicy');

async function view(ownerId) {
    const [owner, settings] = await Promise.all([User.findById(ownerId).select('cancellationPolicy'), getSettings()]);
    const saved = owner?.cancellationPolicy || {};
    const savedTiers = (saved.tiers || []).map((t) => ({ minLeadHours: t.minLeadHours, refundRate: t.refundRate }));
    const eff = effectiveCancellationTiers({ ownerPolicy: saved, settings });
    // Báo cho chủ sân biết nếu biểu đã lưu không còn đạt sàn (Admin vừa nâng sàn) → hệ thống đang dùng biểu chung
    let floorWarning = '';
    if (saved.enabled && savedTiers.length) {
        const n = normalizeTiers(savedTiers);
        floorWarning = n.error || meetsFloor(n.tiers, settings.cancellationFloorTiers) || '';
    }
    return {
        allowed: settings.ownerCancellationPolicyAllowed !== false,
        enabled: !!saved.enabled,
        tiers: savedTiers,
        platformTiers: settings.cancellationTiers || [],
        floorTiers: settings.cancellationFloorTiers || [],
        effective: eff,
        floorWarning,
    };
}

// @route GET /api/owner/cancellation-policy
exports.getPolicy = asyncHandler(async (req, res) => {
    res.json(await view(req.user._id));
});

// @route PUT /api/owner/cancellation-policy   body: { enabled, tiers }
// Chỉ áp dụng cho lượt đặt MỚI sau khi lưu (biểu được chụp vào từng lượt đặt lúc tạo đơn).
exports.updatePolicy = asyncHandler(async (req, res) => {
    const settings = await getSettings();
    if (settings.ownerCancellationPolicyAllowed === false) {
        return res.status(403).json({ message: 'Quản trị viên hiện không cho phép chủ sân tự đặt chính sách hủy' });
    }
    if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ message: 'Thiếu trạng thái bật/tắt chính sách riêng' });

    const update = { 'cancellationPolicy.enabled': req.body.enabled, 'cancellationPolicy.updatedAt': new Date() };
    if (req.body.enabled || req.body.tiers !== undefined) {
        const { tiers, error } = normalizeTiers(req.body.tiers);
        if (error) return res.status(400).json({ message: error });
        // Đạt sàn chỉ bắt buộc khi BẬT; tắt thì cho lưu nháp để chủ sân chỉnh tiếp sau
        if (req.body.enabled) {
            const floorError = meetsFloor(tiers, settings.cancellationFloorTiers);
            if (floorError) return res.status(400).json({ message: floorError });
        }
        update['cancellationPolicy.tiers'] = tiers;
    }
    await User.findOneAndUpdate({ _id: req.user._id, role: 'owner' }, update);
    res.json(await view(req.user._id));
});
