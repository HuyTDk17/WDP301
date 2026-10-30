/**
 * DỊCH VỤ PREMIUM — mua gói, xác nhận thanh toán, nhắc hết hạn, thống kê.
 * Tiền của gói Premium chảy vào tài khoản NỀN TẢNG (khác tiền đặt sân đi thẳng cho chủ sân),
 * nên việc đối chiếu/xác nhận thuộc về nền tảng: webhook ngân hàng hoặc admin.
 */
const PremiumOrder = require('../models/PremiumOrder');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getSettings } = require('../utils/platformSettings');
const premium = require('../utils/premium');
const bankTransfer = require('../utils/bankTransfer');

const DAY = 86400000;
const OPEN = ['pending', 'reported'];

class PremiumError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new PremiumError(status, message); };
const vnd = (n) => `${Math.round(n || 0).toLocaleString('vi-VN')}đ`;
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function notify(userId, payload) {
    try { await Notification.create({ userId, type: 'premium', ...payload }); } catch (e) { console.error('premium notify:', e.message); }
}
async function notifyAdmins(payload) {
    const admins = await User.find({ role: 'admin', status: { $ne: 'banned' } }).select('_id');
    await Promise.all(admins.map((a) => notify(a._id, payload)));
}

function newCode(now = new Date()) {
    const d = new Date(now.getTime() + 7 * 3600 * 1000); // ngày theo giờ Việt Nam
    const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(5, 'X');
    return `PRM${ymd}${rand}`;
}

/** Hướng dẫn chuyển khoản (QR VietQR) vào tài khoản nền tảng cho một đơn. */
async function payInfoOf(order) {
    const settings = await getSettings();
    return bankTransfer.buildInstructions({ settings, amount: order.amount, content: order.code });
}

/** Tạo đơn mua gói theo vai trò của người dùng. Còn đơn đang mở thì trả lại đơn đó (không tạo trùng). */
async function createOrder(user) {
    const settings = await getSettings();
    if (settings.premiumEnabled === false) fail(409, 'Gói Premium hiện chưa mở bán');
    const plan = premium.PLAN_BY_ROLE[user.role];
    if (!plan) fail(403, 'Tài khoản quản trị không mua gói Premium');
    if (!(settings.bankBin && settings.bankAccountNumber)) fail(409, 'Nền tảng chưa cấu hình tài khoản nhận thanh toán, vui lòng thử lại sau');

    const existing = await PremiumOrder.findOne({ userId: user._id, status: { $in: OPEN } });
    if (existing) return { order: existing, reused: true };

    const amount = plan === 'venue_premium' ? (settings.premiumVenuePrice ?? 149000) : (settings.premiumPlayerPrice ?? 29000);
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            const order = await PremiumOrder.create({
                code: newCode(), userId: user._id, plan, audience: premium.AUDIENCE_BY_PLAN[plan], amount,
                durationDays: settings.premiumDurationDays ?? 30, status: 'pending',
                payerName: user.name || '', payerEmail: user.email || '',
            });
            return { order, reused: false };
        } catch (err) {
            if (err.code !== 11000) throw err; // trùng mã (hiếm) → thử mã khác
        }
    }
    return fail(500, 'Không tạo được đơn, vui lòng thử lại');
}

async function reportPaid(orderId, user) {
    const order = await PremiumOrder.findOneAndUpdate(
        { _id: orderId, userId: user._id, status: 'pending' },
        { $set: { status: 'reported', reportedAt: new Date() } }, { new: true },
    );
    if (!order) {
        const cur = await PremiumOrder.findOne({ _id: orderId, userId: user._id });
        if (!cur) fail(404, 'Không tìm thấy đơn này');
        if (cur.status === 'reported') return cur;
        fail(409, 'Đơn này không còn ở trạng thái chờ chuyển khoản');
    }
    await notifyAdmins({
        icon: '👑', title: 'Có đơn Premium chờ đối chiếu',
        message: `${user.name || 'Người dùng'} báo đã chuyển ${vnd(order.amount)} (mã ${order.code}). Hãy đối chiếu sao kê và xác nhận.`,
        link: '/admin/premium',
    });
    return order;
}

async function cancelOrder(orderId, user) {
    const order = await PremiumOrder.findOneAndUpdate(
        { _id: orderId, userId: user._id, status: 'pending' }, { $set: { status: 'cancelled' } }, { new: true },
    );
    if (!order) fail(409, 'Chỉ huỷ được đơn chưa báo chuyển khoản');
    return order;
}

/**
 * Xác nhận đã nhận tiền: kích hoạt/gia hạn gói. Nguyên tử theo trạng thái nên bấm hai lần hoặc
 * webhook + admin cùng lúc cũng chỉ cộng thời hạn MỘT lần. Còn hạn thì cộng nối tiếp từ ngày hết hạn cũ.
 */
async function confirmOrder(orderId, adminId, { auto = false } = {}) {
    const claimed = await PremiumOrder.findOneAndUpdate(
        { _id: orderId, status: { $in: OPEN } },
        { $set: { status: 'paid', paidAt: new Date(), confirmedBy: adminId || null, autoConfirmed: !!auto } },
        { new: true },
    );
    if (!claimed) {
        const cur = await PremiumOrder.findById(orderId);
        if (!cur) fail(404, 'Không tìm thấy đơn này');
        fail(409, cur.status === 'paid' ? 'Đơn này đã được xác nhận rồi' : 'Đơn này không còn chờ thanh toán');
    }
    const user = await User.findById(claimed.userId);
    const now = Date.now();
    const stack = premium.hasPlan(user, claimed.plan, now);
    const startsAt = stack ? new Date(user.premium.until) : new Date(now);
    const endsAt = new Date(startsAt.getTime() + claimed.durationDays * DAY);
    claimed.startsAt = startsAt; claimed.endsAt = endsAt;
    await claimed.save();
    await User.updateOne({ _id: claimed.userId }, {
        $set: { 'premium.plan': claimed.plan, 'premium.since': stack ? user.premium.since : startsAt, 'premium.until': endsAt },
    });
    await notify(claimed.userId, {
        icon: '👑', title: 'Gói Premium đã kích hoạt',
        message: `Cảm ơn bạn! Gói ${claimed.plan === 'venue_premium' ? 'Venue Premium' : 'Premium Player'} có hiệu lực đến ${new Date(endsAt.getTime() + 7 * 3600000).toISOString().slice(0, 10).split('-').reverse().join('/')}.`,
        link: '/premium',
    });
    return claimed;
}

async function rejectOrder(orderId, adminId, reason) {
    const order = await PremiumOrder.findOneAndUpdate(
        { _id: orderId, status: { $in: OPEN } },
        { $set: { status: 'rejected', rejectReason: String(reason || 'Không thấy khoản chuyển khoản khớp').slice(0, 300), confirmedBy: adminId || null } },
        { new: true },
    );
    if (!order) fail(409, 'Đơn này không còn chờ đối chiếu');
    await notify(order.userId, {
        icon: '⚠️', title: 'Chưa xác nhận được thanh toán Premium',
        message: `${order.rejectReason}. Nếu bạn đã chuyển khoản, vui lòng liên hệ hỗ trợ kèm mã ${order.code}.`, link: '/premium',
    });
    return order;
}

/**
 * Webhook ngân hàng của NỀN TẢNG (cùng endpoint với phí dịch vụ): khớp theo mã đơn trong nội dung.
 * Tiền về nhiều lần được cộng dồn; đủ số tiền thì xác nhận. Giao dịch bắn lại không cộng lần hai.
 */
async function autoConfirmFromBank({ txnId, amount, content, accountNumber = '', direction = 'in' }) {
    const money = Math.round(Number(amount) || 0);
    if (direction !== 'in' || money <= 0 || !txnId) return { status: 'ignored' };
    const text = norm(content);
    if (!text.includes('PRM')) return { status: 'no_match' };

    const open = await PremiumOrder.find({ status: { $in: OPEN } });
    const target = open.find((o) => text.includes(norm(o.code)));
    if (!target) return { status: 'no_match' };

    const settings = await getSettings();
    const acct = String(accountNumber || '').replace(/\D/g, '');
    const expected = String(settings.bankAccountNumber || '').replace(/\D/g, '');
    if (acct && expected && acct !== expected) return { status: 'no_match' };

    const updated = await PremiumOrder.findOneAndUpdate(
        { _id: target._id, status: { $in: OPEN }, bankTxnIds: { $ne: String(txnId) } },
        { $inc: { receivedAmount: money }, $push: { bankTxnIds: String(txnId) } }, { new: true },
    );
    if (!updated) return { status: 'duplicate' };

    if ((updated.receivedAmount || 0) >= updated.amount) {
        const paid = await confirmOrder(updated._id, null, { auto: true });
        return { status: 'confirmed', order: paid };
    }
    await notify(updated.userId, {
        icon: '⚠️', title: 'Đã nhận một phần thanh toán Premium',
        message: `Đã nhận ${vnd(updated.receivedAmount)}/${vnd(updated.amount)} cho mã ${updated.code}. Vui lòng chuyển nốt phần còn thiếu (cùng nội dung).`, link: '/premium',
    });
    return { status: 'partial', order: updated };
}

/** Nhắc sắp hết hạn (còn ≤ 3 ngày) và báo đã hết hạn — mỗi loại một lần cho mỗi đơn mới nhất. */
async function sendExpiryReminders(now = new Date()) {
    let sent = 0;
    const soon = await PremiumOrder.find({ status: 'paid', remindedAt: null, endsAt: { $gt: now, $lte: new Date(now.getTime() + 3 * DAY) } });
    for (const o of soon) {
        const user = await User.findById(o.userId).select('premium');
        if (!user?.premium?.until || new Date(user.premium.until).getTime() !== new Date(o.endsAt).getTime()) continue; // đã gia hạn
        const c = await PremiumOrder.findOneAndUpdate({ _id: o._id, remindedAt: null }, { $set: { remindedAt: now } });
        if (!c) continue;
        await notify(o.userId, { icon: '⏳', title: 'Gói Premium sắp hết hạn', message: 'Gói của bạn còn dưới 3 ngày. Gia hạn sớm để không mất quyền lợi.', link: '/premium' });
        sent += 1;
    }
    const ended = await PremiumOrder.find({ status: 'paid', expiredNotifiedAt: null, endsAt: { $lte: now } });
    for (const o of ended) {
        const user = await User.findById(o.userId).select('premium');
        if (user?.premium?.until && new Date(user.premium.until).getTime() > new Date(o.endsAt).getTime()) continue; // đã gia hạn tiếp
        const c = await PremiumOrder.findOneAndUpdate({ _id: o._id, expiredNotifiedAt: null }, { $set: { expiredNotifiedAt: now } });
        if (!c) continue;
        await notify(o.userId, { icon: '📴', title: 'Gói Premium đã hết hạn', message: 'Bạn có thể gia hạn bất cứ lúc nào để dùng lại các quyền lợi Premium.', link: '/premium' });
        sent += 1;
    }
    return sent;
}

/** Thống kê doanh thu Premium cho admin. */
async function stats(now = new Date()) {
    const paid = await PremiumOrder.find({ status: 'paid' }).select('plan amount paidAt endsAt userId');
    const byPlan = { venue_premium: { count: 0, revenue: 0 }, player_premium: { count: 0, revenue: 0 } };
    const byMonth = {};
    const activeUsers = { venue_premium: new Set(), player_premium: new Set() };
    let revenue = 0;
    for (const o of paid) {
        revenue += o.amount;
        byPlan[o.plan].count += 1; byPlan[o.plan].revenue += o.amount;
        const m = new Date(new Date(o.paidAt).getTime() + 7 * 3600000).toISOString().slice(0, 7);
        byMonth[m] = (byMonth[m] || 0) + o.amount;
        if (o.endsAt && new Date(o.endsAt) > now) activeUsers[o.plan].add(String(o.userId));
    }
    const pending = await PremiumOrder.countDocuments({ status: 'reported' });
    return {
        revenue, orders: paid.length, byPlan, pendingReview: pending,
        active: { venue_premium: activeUsers.venue_premium.size, player_premium: activeUsers.player_premium.size },
        byMonth: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount })),
    };
}

module.exports = {
    PremiumError, createOrder, reportPaid, cancelOrder, confirmOrder, rejectOrder,
    autoConfirmFromBank, sendExpiryReminders, stats, payInfoOf,
};
