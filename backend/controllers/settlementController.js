const OwnerSettlement = require('../models/OwnerSettlement');
const Payout = require('../models/Payout');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const bankTransfer = require('../utils/bankTransfer');
const svc = require('../services/settlementService');
const { getSettings } = require('../utils/platformSettings');

/** Biến lỗi nghiệp vụ của service thành phản hồi HTTP, các lỗi khác để asyncHandler xử lý. */
const guard = (fn) => asyncHandler(async (req, res) => {
    try { return await fn(req, res); } catch (err) {
        if (err instanceof svc.SettlementError) return res.status(err.status).json({ message: err.message });
        throw err;
    }
});

/** Thêm hướng dẫn chuyển khoản (mã QR VietQR) cho hoá đơn chủ sân phải nộp. */
function withPayInfo(s, opts) {
    const obj = s.toObject ? s.toObject() : s;
    obj.overdue = s.status === 'issued' && new Date(s.dueDate) < new Date();
    // opts chỉ có khi controller chủ sân truyền vào (tránh nhầm với chỉ số của Array.map)
    if (opts && typeof opts === 'object' && opts.graceDays != null) obj.lockDate = svc.lockDateOf(s, opts.graceDays);
    if (s.direction === 'owner_pays' && s.payee?.bankBin) {
        obj.payInfo = bankTransfer.buildInstructionsForAccount({
            account: s.payee, windowMinutes: 0, amount: s.amount, content: s.code,
        });
    }
    return obj;
}

// ============================================================
// CHỦ SÂN
// ============================================================

// @route GET /api/owner/commission
exports.getMyCommission = asyncHandler(async (req, res) => {
    const [balance, settlements, blocked, settings] = await Promise.all([
        svc.computeBalance(req.user._id),
        OwnerSettlement.find({ ownerId: req.user._id }).sort({ createdAt: -1 }).limit(24),
        svc.isOwnerBlocked(req.user._id),
        getSettings(),
    ]);
    const graceDays = settings.commissionGraceDays ?? 3;
    const list = settlements.map((x) => withPayInfo(x, { graceDays }));
    res.json({
        balance,
        policy: { dueDays: settings.commissionDueDays ?? 7, graceDays, lockDays: (settings.commissionDueDays ?? 7) + graceDays, blockEnabled: !!settings.commissionBlockEnabled, autoConfirm: !!process.env.BANK_WEBHOOK_SECRET },
        open: list.find((s) => ['issued', 'reported'].includes(s.status)) || null,
        history: list.filter((s) => !['issued', 'reported'].includes(s.status)),
        blocked,
    });
});

// @route GET /api/owner/commission/orders?month=YYYY-MM — phí dịch vụ theo từng đơn
exports.getMyFeeOrders = asyncHandler(async (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : undefined;
    res.json(await svc.listFeeOrders(req.user._id, month));
});

// @route POST /api/owner/commission/:id/report
exports.reportPaid = guard(async (req, res) => {
    const s = await svc.reportPaid(req.params.id, req.user._id, req.body.note);
    res.json({ settlement: withPayInfo(s) });
});

// ============================================================
// QUẢN TRỊ VIÊN — chỉ làm việc với chủ sân về hoa hồng
// ============================================================

// @route GET /api/admin/settlements?status=reported
exports.listSettlements = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const settlements = await OwnerSettlement.find(filter)
        .populate('ownerId', 'name email phone businessName')
        .sort({ createdAt: -1 }).limit(200);
    res.json({ settlements: settlements.map(withPayInfo), total: settlements.length });
});

// @route GET /api/admin/settlements/balances  — số dư của mọi chủ sân (để biết ai đang nợ)
exports.getBalances = asyncHandler(async (req, res) => {
    const owners = await User.find({ role: 'owner' }).select('name email businessName');
    const open = await OwnerSettlement.find({ status: { $in: ['issued', 'reported'] } }).select('ownerId status direction amount dueDate code');
    const openByOwner = Object.fromEntries(open.map((s) => [String(s.ownerId), s]));

    const rows = [];
    for (const o of owners) {
        const bal = await svc.computeBalance(o._id);
        rows.push({
            ownerId: o._id, name: o.businessName || o.name, email: o.email,
            ...bal, openSettlement: openByOwner[String(o._id)] || null,
        });
    }
    rows.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    res.json({ owners: rows });
});

// @route GET /api/admin/owners/:id/settlements  — số dư + hoá đơn + phiếu chi cũ của một chủ sân
exports.getOwnerSettlementsAdmin = asyncHandler(async (req, res) => {
    const [balance, settlements, payouts] = await Promise.all([
        svc.computeBalance(req.params.id),
        OwnerSettlement.find({ ownerId: req.params.id }).sort({ createdAt: -1 }).limit(24),
        Payout.find({ ownerId: req.params.id }).sort({ createdAt: -1 }).limit(24),
    ]);
    res.json({ balance, settlements: settlements.map(withPayInfo), payouts });
});

// @route POST /api/admin/owners/:id/settlements  — lập hoá đơn ngay (không chờ kỳ tháng)
exports.issueForOwner = guard(async (req, res) => {
    const r = await svc.issueSettlement(req.params.id, { issuedBy: req.user._id });
    if (r.skipped) {
        return res.status(409).json({ message: 'Số dư hiện tại quá nhỏ (dưới 1.000đ) nên chưa cần lập hoá đơn.', balance: r.balance });
    }
    res.status(201).json({ settlement: withPayInfo(r.settlement) });
});

// @route POST /api/admin/settlements/:id/confirm
exports.confirmSettlement = guard(async (req, res) => {
    const s = await svc.confirmSettlement(req.params.id, req.user._id);
    res.json({ settlement: withPayInfo(s) });
});

// @route POST /api/admin/settlements/:id/reject
exports.rejectSettlement = guard(async (req, res) => {
    const s = await svc.rejectReport(req.params.id, req.body.reason);
    res.json({ settlement: withPayInfo(s) });
});

// @route POST /api/admin/settlements/:id/cancel
exports.cancelSettlement = guard(async (req, res) => {
    const s = await svc.cancelSettlement(req.params.id);
    res.json({ settlement: withPayInfo(s) });
});

// ============================================================
// WEBHOOK NGÂN HÀNG — tự động xác nhận chủ sân đã nộp phí dịch vụ
// ============================================================

const crypto = require('crypto');
const safeEqual = (a, b) => {
    const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Chuẩn hoá payload của SePay ({id, transferType, transferAmount, content, accountNumber}) hoặc Casso ({data:{id, amount, description}}). */
function parseBankPayload(body = {}) {
    if (body.transferAmount !== undefined || body.transferType !== undefined) {
        return {
            txnId: body.id ?? body.referenceCode,
            amount: body.transferAmount,
            content: `${body.content || ''} ${body.code || ''}`,
            accountNumber: body.accountNumber,
            direction: String(body.transferType || 'in').toLowerCase() === 'out' ? 'out' : 'in',
        };
    }
    const d = Array.isArray(body.data) ? body.data[0] : body.data;
    if (d) {
        return {
            txnId: d.id ?? d.tid ?? d.reference,
            amount: d.amount,
            content: d.description || '',
            accountNumber: d.bankSubAccId || d.accountNumber,
            direction: Number(d.amount) < 0 ? 'out' : 'in',
        };
    }
    return {};
}

// @route POST /api/webhooks/bank  (công khai, xác thực bằng khoá BANK_WEBHOOK_SECRET)
exports.bankWebhook = asyncHandler(async (req, res) => {
    const secret = process.env.BANK_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ success: false, message: 'Chưa bật tự động xác nhận (thiếu BANK_WEBHOOK_SECRET)' });

    const auth = String(req.headers.authorization || '').replace(/^(apikey|bearer)\s+/i, '');
    const provided = auth || req.headers['secure-token'] || req.headers['x-api-key'];
    if (!safeEqual(provided, secret)) return res.status(401).json({ success: false, message: 'Sai khoá xác thực' });

    const txn = parseBankPayload(req.body);
    // Luôn trả 200 cho giao dịch hợp lệ-về-hình-thức (kể cả không khớp hoá đơn nào) để nhà cung
    // cấp không bắn lại mãi; kết quả khớp được ghi vào nhật ký để đối chiếu.
    try {
        const r = await svc.autoConfirmFromBank(txn);
        if (r.status !== 'ignored') console.log(`🏦 webhook ngân hàng ${txn.txnId}: ${r.status}`);
        return res.json({ success: true, result: r.status });
    } catch (err) {
        console.error('bankWebhook', err.message);
        return res.status(500).json({ success: false }); // để nhà cung cấp thử lại
    }
});
exports.parseBankPayload = parseBankPayload;
