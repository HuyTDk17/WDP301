const PremiumOrder = require('../models/PremiumOrder');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { getSettings } = require('../utils/platformSettings');
const premium = require('../utils/premium');
const svc = require('../services/premiumService');

/** Biến lỗi nghiệp vụ thành phản hồi HTTP, lỗi khác để asyncHandler xử lý. */
const guard = (fn) => asyncHandler(async (req, res) => {
    try { return await fn(req, res); } catch (err) {
        if (err instanceof svc.PremiumError) return res.status(err.status).json({ message: err.message });
        throw err;
    }
});

async function withPay(order) {
    const o = order.toObject ? order.toObject() : order;
    if (['pending', 'reported'].includes(o.status)) o.payInfo = await svc.payInfoOf(o);
    return o;
}

// @route GET /api/premium/plans  (công khai; có đăng nhập thì kèm gói của mình)
exports.getPlans = asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const catalog = premium.catalog(settings);
    const mine = req.user ? premium.PLAN_BY_ROLE[req.user.role] || null : null;
    res.json({ ...catalog, myPlanId: mine, plans: catalog.plans });
});

// @route GET /api/premium/me
exports.getMine = asyncHandler(async (req, res) => {
    const u = req.user;
    const [orders, settings] = await Promise.all([
        PremiumOrder.find({ userId: u._id }).sort({ createdAt: -1 }).limit(30),
        getSettings(),
    ]);
    const list = await Promise.all(orders.map(withPay));
    res.json({
        planId: premium.PLAN_BY_ROLE[u.role] || null,
        active: premium.isActive(u),
        plan: premium.isActive(u) ? u.premium.plan : null,
        since: u.premium?.since || null,
        until: u.premium?.until || null,
        daysLeft: premium.daysLeft(u),
        open: list.find((o) => ['pending', 'reported'].includes(o.status)) || null,
        history: list.filter((o) => !['pending', 'reported'].includes(o.status)),
        autoConfirm: !!process.env.BANK_WEBHOOK_SECRET,
        catalog: premium.catalog(settings),
    });
});

// @route POST /api/premium/orders
exports.createOrder = guard(async (req, res) => {
    const { order, reused } = await svc.createOrder(req.user);
    res.status(reused ? 200 : 201).json({ order: await withPay(order), reused });
});

// @route POST /api/premium/orders/:id/report
exports.reportPaid = guard(async (req, res) => {
    res.json({ order: await withPay(await svc.reportPaid(req.params.id, req.user)) });
});

// @route POST /api/premium/orders/:id/cancel
exports.cancelOrder = guard(async (req, res) => {
    res.json({ order: await svc.cancelOrder(req.params.id, req.user) });
});

// ============================================================
// QUẢN TRỊ VIÊN — Premium là doanh thu của nền tảng nên admin đối chiếu và xác nhận
// ============================================================

// @route GET /api/admin/premium/orders?status=&plan=&search=&page=&limit=
exports.listOrders = asyncHandler(async (req, res) => {
    const { status, plan, search = '' } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = {};
    if (status) filter.status = status;
    if (plan) filter.plan = plan;
    if (search.trim()) {
        const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ code: re }, { payerName: re }, { payerEmail: re }, { venueName: re }];
    }
    const [total, orders] = await Promise.all([
        PremiumOrder.countDocuments(filter),
        PremiumOrder.find(filter).sort({ paidAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ]);
    res.json({ orders, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// @route GET /api/admin/premium/stats
exports.getStats = asyncHandler(async (req, res) => res.json(await svc.stats()));

// @route POST /api/admin/premium/orders/:id/confirm
exports.confirmOrder = guard(async (req, res) => {
    res.json({ order: await svc.confirmOrder(req.params.id, req.user._id) });
});

// @route POST /api/admin/premium/orders/:id/reject
exports.rejectOrder = guard(async (req, res) => {
    res.json({ order: await svc.rejectOrder(req.params.id, req.user._id, req.body.reason) });
});
