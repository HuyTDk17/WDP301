const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');
const { getSettings } = require('../utils/platformSettings');

const isId = (v) => mongoose.isValidObjectId(v);
const STATUSES = ['none', 'pending', 'approved', 'rejected', 'revoked'];

/** Chủ sân cũ chưa có trường transferNetwork thì tính là 'none'. */
const statusFilter = (s) => (s === 'none'
    ? { $or: [{ 'transferNetwork.status': 'none' }, { 'transferNetwork.status': { $exists: false } }] }
    : { 'transferNetwork.status': s });

const shape = (u) => ({
    _id: u._id, name: u.name, email: u.email, phone: u.phone || '',
    status: u.transferNetwork?.status || 'none',
    requestedAt: u.transferNetwork?.requestedAt || null,
    reviewedAt: u.transferNetwork?.reviewedAt || null,
    note: u.transferNetwork?.note || '',
});

async function notify(userId, payload) {
    try { await Notification.create({ userId, type: 'transfer_network', icon: '🔄', ...payload }); }
    catch (err) { console.error('Gửi thông báo mạng lưới chuyển sân thất bại:', err.message); }
}

// ============================================================
// CHỦ SÂN
// ============================================================

// @route GET /api/owner/network
exports.getMyNetwork = asyncHandler(async (req, res) => {
    const [settings, owner] = await Promise.all([getSettings(), User.findById(req.user._id).select('transferNetwork')]);
    res.json({ required: !!settings.transferNetworkRequired, ...shape({ ...(owner?.toObject ? owner.toObject() : owner), _id: req.user._id }) });
});

// @route POST /api/owner/network/request
exports.requestToJoin = asyncHandler(async (req, res) => {
    const owner = await User.findById(req.user._id).select('name transferNetwork');
    const current = owner?.transferNetwork?.status || 'none';
    if (current === 'approved') return res.status(409).json({ message: 'Bạn đã là thành viên của mạng lưới chuyển sân' });
    if (current === 'pending') return res.status(409).json({ message: 'Yêu cầu của bạn đang chờ quản trị viên duyệt' });
    if (current === 'revoked') return res.status(409).json({ message: 'Tư cách thành viên của bạn đã bị gỡ. Vui lòng liên hệ quản trị viên để được xem xét lại.' });

    // Cập nhật CÓ ĐIỀU KIỆN: hai lần bấm cùng lúc chỉ tạo một yêu cầu và chỉ báo admin một lần.
    const updated = await User.findOneAndUpdate(
        { _id: req.user._id, role: 'owner', $or: [{ 'transferNetwork.status': { $in: ['none', 'rejected'] } }, { 'transferNetwork.status': { $exists: false } }] },
        { 'transferNetwork.status': 'pending', 'transferNetwork.requestedAt': new Date(), 'transferNetwork.note': '' },
        { new: true }
    );
    if (!updated) return res.status(409).json({ message: 'Không thể gửi yêu cầu lúc này' });

    const admins = await User.find({ role: 'admin', status: { $ne: 'banned' } }).select('_id');
    await Promise.all(admins.map((a) => notify(a._id, {
        title: 'Có chủ sân xin vào mạng lưới chuyển sân',
        message: `${owner.name} xin tham gia mạng lưới chuyển sân liên chủ sân.`,
        link: '/admin/network',
    })));
    res.status(201).json(shape(updated));
});

// ============================================================
// QUẢN TRỊ VIÊN
// ============================================================

// @route GET /api/admin/network?status=&search=&page=&limit=
exports.listOwners = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const { status, search = '' } = req.query;

    const filter = { role: 'owner' };
    if (STATUSES.includes(status)) Object.assign(filter, statusFilter(status));
    if (String(search).trim()) {
        const re = new RegExp(escapeRegex(String(search).trim()), 'i');
        filter.$and = [{ $or: [{ name: re }, { email: re }] }];
    }

    const [settings, total, owners, ...counts] = await Promise.all([
        getSettings(),
        User.countDocuments(filter),
        User.find(filter).sort({ 'transferNetwork.requestedAt': -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('name email phone transferNetwork'),
        ...STATUSES.map((s) => User.countDocuments({ role: 'owner', ...statusFilter(s) })),
    ]);
    const stats = Object.fromEntries(STATUSES.map((s, i) => [s, counts[i]]));
    stats.total = counts.reduce((a, b) => a + b, 0);

    res.json({
        required: !!settings.transferNetworkRequired,
        owners: owners.map(shape), total, page, totalPages: Math.max(1, Math.ceil(total / limit)), stats,
    });
});

// Từ trạng thái nào được phép thực hiện hành động nào (cũng là điều kiện của cập nhật có điều kiện chống chạy đua).
const TRANSITIONS = {
    approve: { from: ['none', 'pending', 'rejected', 'revoked'], to: 'approved', needReason: false },
    reject: { from: ['pending'], to: 'rejected', needReason: true },
    revoke: { from: ['approved'], to: 'revoked', needReason: true },
};

// @route PATCH /api/admin/network/:ownerId   body: { action: 'approve'|'reject'|'revoke', reason }
exports.reviewOwner = asyncHandler(async (req, res) => {
    if (!isId(req.params.ownerId)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const rule = TRANSITIONS[req.body.action];
    if (!rule) return res.status(400).json({ message: 'Hành động không hợp lệ' });
    const reason = String(req.body.reason || '').trim();
    if (rule.needReason && reason.length < 5) return res.status(400).json({ message: 'Vui lòng nhập lý do (ít nhất 5 ký tự)' });
    if (reason.length > 500) return res.status(400).json({ message: 'Lý do tối đa 500 ký tự' });

    const owner = await User.findOne({ _id: req.params.ownerId, role: 'owner' }).select('name transferNetwork');
    if (!owner) return res.status(404).json({ message: 'Không tìm thấy chủ sân này' });
    const current = owner.transferNetwork?.status || 'none';
    if (!rule.from.includes(current)) return res.status(409).json({ message: 'Trạng thái hiện tại không cho phép thao tác này' });

    const fromClause = rule.from.includes('none')
        ? { $or: [{ 'transferNetwork.status': { $in: rule.from } }, { 'transferNetwork.status': { $exists: false } }] }
        : { 'transferNetwork.status': { $in: rule.from } };
    const updated = await User.findOneAndUpdate(
        { _id: owner._id, role: 'owner', ...fromClause },
        { 'transferNetwork.status': rule.to, 'transferNetwork.reviewedAt': new Date(), 'transferNetwork.reviewedBy': req.user._id, 'transferNetwork.note': reason },
        { new: true }
    );
    if (!updated) return res.status(409).json({ message: 'Chủ sân này vừa được xử lý bởi người khác' });

    const messages = {
        approve: ['Bạn đã được duyệt vào mạng lưới chuyển sân', 'Khách hàng giờ có thể chuyển lượt đặt giữa địa điểm của bạn và các chủ sân khác trong mạng lưới.'],
        reject: ['Yêu cầu vào mạng lưới chuyển sân chưa được duyệt', `Lý do: ${reason}. Bạn có thể cải thiện và gửi lại yêu cầu.`],
        revoke: ['Tư cách thành viên mạng lưới chuyển sân đã bị gỡ', `Lý do: ${reason}. Chuyển sân sang chủ sân khác sẽ không còn áp dụng với địa điểm của bạn.`],
    }[req.body.action];
    await notify(owner._id, { title: messages[0], message: messages[1], link: '/owner/transfers' });
    res.json({ owner: shape(updated) });
});

// @route POST /api/admin/network/approve-pending — duyệt tất cả yêu cầu đang chờ
exports.approveAllPending = asyncHandler(async (req, res) => {
    const pending = await User.find({ role: 'owner', 'transferNetwork.status': 'pending' }).select('_id');
    let approved = 0;
    for (const o of pending) {
        // Từng người một, có điều kiện — ai vừa bị admin khác xử lý thì bỏ qua.
        const updated = await User.findOneAndUpdate(
            { _id: o._id, 'transferNetwork.status': 'pending' },
            { 'transferNetwork.status': 'approved', 'transferNetwork.reviewedAt': new Date(), 'transferNetwork.reviewedBy': req.user._id, 'transferNetwork.note': '' },
            { new: true }
        );
        if (updated) {
            approved += 1;
            await notify(o._id, { title: 'Bạn đã được duyệt vào mạng lưới chuyển sân', message: 'Khách hàng giờ có thể chuyển lượt đặt giữa địa điểm của bạn và các chủ sân khác trong mạng lưới.', link: '/owner/transfers' });
        }
    }
    res.json({ approved });
});
