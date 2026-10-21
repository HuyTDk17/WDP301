/**
 * KIỂM THỬ LUỒNG ĐỐI SOÁT HOA HỒNG & HOÀN TIỀN DO CHỦ SÂN.
 *
 * Không cần MongoDB: model được thay bằng bộ nhớ (xem makeModel), còn settlementService,
 * settlementController, refundService, bankTransfer… là mã thật. Khoá các quy tắc:
 *   • Số dư/hoá đơn đúng chiều; mỗi chủ sân chỉ một hoá đơn mở; hoá đơn hiện mã QR nộp cho nền tảng.
 *   • Chủ sân chỉ báo được hoá đơn của mình; báo nhiều lần chỉ báo admin một lần.
 *   • Admin xác nhận → số dư về 0; xác nhận lại không đổi gì; từ chối → quay về chờ nộp.
 *   • Chủ sân quá hạn + ân hạn thì bị chặn nhận đặt mới; đang chờ admin đối chiếu thì không.
 *   • Hoàn tiền của đơn khách chuyển thẳng cho chủ sân là việc của CHỦ SÂN, admin bị chặn.
 */
const assert = require('assert');
const path = require('path');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

// ---------- Bản giả ----------
const resolve = (rel) => require.resolve(path.join(__dirname, '..', rel));
function fake(rel, exports) {
    const filename = resolve(rel);
    require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
function q(value) {
    const p = Promise.resolve(value);
    p.select = () => q(value); p.populate = () => q(value); p.sort = () => q(value); p.limit = () => q(value);
    return p;
}
const getPath = (doc, key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);
function matches(doc, filter = {}) {
    return Object.entries(filter).every(([key, cond]) => {
        const v = getPath(doc, key);
        if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('$in' in cond) return cond.$in.map(String).includes(String(v));
            if ('$ne' in cond) {
                if (Array.isArray(v)) return !v.map(String).includes(String(cond.$ne));
                return cond.$ne === null ? v != null : String(v) !== String(cond.$ne);
            }
            if ('$lt' in cond) return v != null && v < cond.$lt;
            return true;
        }
        if (cond === null) return v == null;
        return String(v) === String(cond);
    });
}

let seq = 0;
/** Một "collection" trong bộ nhớ, đủ cho cách service/controller gọi. */
function makeModel({ pre = null, unique = [], defaults = {} } = {}) {
    const rows = [];
    const make = (data) => {
        const d = { ...data, save: async function () { if (pre) pre(this); return this; } };
        d.toObject = () => ({ ...d });
        return d;
    };
    const api = {
        rows,
        create: async (data) => {
            // defaults mô phỏng giá trị mặc định của schema thật (Mongoose tự điền, bản giả thì không)
            const d = make({ _id: `id${++seq}`, createdAt: new Date(), ...defaults, ...data });
            if (pre) pre(d);
            for (const key of unique) {
                if (d[key] != null && rows.some((r) => r[key] === d[key])) { const e = new Error('E11000'); e.code = 11000; throw e; }
            }
            rows.push(d);
            return d;
        },
        insertMany: async (list) => { for (const x of list) await api.create(x); return list; },
        find: (f) => q(rows.filter((r) => matches(r, f))),
        findOne: (f) => q(rows.find((r) => matches(r, f)) || null),
        findById: (id) => q(rows.find((r) => r._id === id) || null),
        exists: (f) => q(rows.find((r) => matches(r, f)) ? { _id: 'x' } : null),
        // Giống Mongo: khớp + sửa nguyên tử, KHÔNG chạy hook pre('save')
        findOneAndUpdate: async (filter, update) => {
            const doc = rows.find((r) => matches(r, filter));
            if (!doc) return null;
            Object.assign(doc, update.$set || {});
            Object.entries(update.$inc || {}).forEach(([k, n]) => { doc[k] = (doc[k] || 0) + n; });
            Object.entries(update.$push || {}).forEach(([k, x]) => { doc[k] = [...(doc[k] || []), x]; });
            Object.keys(update.$unset || {}).forEach((k) => { doc[k] = undefined; });
            return doc;
        },
    };
    return api;
}

const openKeyPre = (kind, openStatuses) => (d) => {
    d.openKey = openStatuses.includes(d.status) ? `${kind}:${d.ownerId || d.bookingId}` : undefined;
};

const M = {};
const state = { ledger: [], settings: null };
function reset() {
    seq = 0; state.ledger = [];
    M.Booking = makeModel(); M.Venue = makeModel(); M.Court = makeModel(); M.Payout = makeModel();
    M.User = makeModel(); M.Notification = makeModel();
    M.Payment = makeModel({ pre: (d) => { d.openKey = (d.purpose === 'booking' && ['pending', 'awaiting_confirmation'].includes(d.status)) ? `booking:${d.bookingId}` : undefined; } });
    M.OwnerSettlement = makeModel({ pre: openKeyPre('owner', ['issued', 'reported']), defaults: { status: 'issued', reportedNote: '', rejectionNote: '', receivedAmount: 0, bankTxnIds: [], reminderStage: 0, autoConfirmed: false } });
    state.settings = {
        commissionDueDays: 7, commissionGraceDays: 7,  commissionBlockEnabled: true, commissionAutoIssueEnabled: true,
        bankName: 'ACB', bankBin: '970416', bankAccountNumber: 'PLATFORM999', bankAccountName: 'NEN TANG',
        pointValueVnd: 0,
    };
}
reset();

fake('models/Booking.js', { find: (f) => M.Booking.find(f), findById: (i) => M.Booking.findById(i) });
fake('models/Venue.js', { find: (f) => M.Venue.find(f), findById: (i) => M.Venue.findById(i) });
fake('models/Court.js', { findById: (i) => M.Court.findById(i) });
fake('models/Payment.js', {
    find: (f) => M.Payment.find(f), findOne: (f) => M.Payment.findOne(f), findById: (i) => M.Payment.findById(i),
    create: (d) => M.Payment.create(d), findOneAndUpdate: (f, u) => M.Payment.findOneAndUpdate(f, u),
});
fake('models/Payout.js', { find: (f) => M.Payout.find(f) });
fake('models/User.js', { find: (f) => M.User.find(f), findById: (i) => M.User.findById(i) });
fake('models/Notification.js', { create: (d) => M.Notification.create(d), insertMany: (l) => M.Notification.insertMany(l) });
fake('models/OwnerSettlement.js', {
    find: (f) => M.OwnerSettlement.find(f), findOne: (f) => M.OwnerSettlement.findOne(f), findById: (i) => M.OwnerSettlement.findById(i),
    create: (d) => M.OwnerSettlement.create(d), exists: (f) => M.OwnerSettlement.exists(f),
    findOneAndUpdate: (f, u) => M.OwnerSettlement.findOneAndUpdate(f, u),
});
fake('utils/platformSettings.js', { getSettings: async () => state.settings, getCommissionRate: async () => 0.1 });
fake('utils/ledger.js', { record: async (e) => { state.ledger.push(e); return []; } });

const settlementService = require('../services/settlementService');
const settlementController = require('../controllers/settlementController');
const refundService = require('../services/refundService');
// paymentController kéo theo nhiều thứ — chỉ cần 3 hàm hoàn tiền, nên giả các phụ thuộc nặng
fake('controllers/promotionController.js', { validateAndCalculateDiscount: async () => ({ valid: false }) });
fake('services/transferService.js', {});
fake('models/TransferRequest.js', {});
fake('models/Hold.js', {});
fake('utils/slotLock.js', { acquire: async () => ({}), release: async () => {} });
fake('utils/credit.js', { reserve: async () => 0, release: async () => {}, splitRefund: (r) => ({ cash: r, credit: 0 }) });
const paymentController = require('../controllers/paymentController');
const bookingController = require('../controllers/bookingController');

function call(handler, { params = {}, body = {}, query = {}, user, headers = {} } = {}) {
    return new Promise((resolveCall, reject) => {
        const res = {
            statusCode: 200, body: undefined,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; resolveCall(this); return this; }, end() { resolveCall(this); return this; },
        };
        handler({ params, body, query, user, headers }, res, reject);
    });
}

// ---------- Dữ liệu mẫu ----------
async function seed({ bookings = 1 } = {}) {
    reset();
    await M.User.create({ _id: 'ownerA', role: 'owner', name: 'Chu San A', bankName: 'ACB', bankBin: '970416', bankAccount: '111222333', bankAccountName: 'CHU SAN A' });
    await M.User.create({ _id: 'ownerB', role: 'owner', name: 'Chu San B' });
    await M.User.create({ _id: 'admin1', role: 'admin' });
    await M.User.create({ _id: 'cust1', role: 'customer' });
    await M.Venue.create({ _id: 'venueA', ownerId: 'ownerA', status: 'approved', isActive: true });
    for (let i = 0; i < bookings; i += 1) {
        const bid = `book${i + 1}`;
        await M.Booking.create({ _id: bid, venueId: 'venueA', customerId: 'cust1', status: 'confirmed', paymentMethod: 'bank_transfer', amount: 200000, serviceFee: 0, ownerCommission: 20000 });
        await M.Payment.create({ _id: `pay${i + 1}`, bookingId: bid, purpose: 'booking', method: 'bank_transfer', amount: 200000, status: 'completed', receiver: { ownerId: 'ownerA' } });
    }
}
const asUser = (id) => M.User.rows.find((u) => u._id === id);

// ---------- Hoá đơn ----------
test('SF-01 · số dư 3 đơn = 60.000đ; lập hoá đơn owner_pays, chốt số tiền, có mã QR nộp cho NỀN TẢNG', async () => {
    await seed({ bookings: 3 });
    const r = await settlementService.issueSettlement('ownerA', { issuedBy: 'admin1' });
    const s = r.settlement;
    assert.strictEqual(s.direction, 'owner_pays');
    assert.strictEqual(s.amount, 60000);
    assert.strictEqual(s.payee.accountNumber, 'PLATFORM999');
    assert.ok(/^HH\d{6}/.test(s.code));

    const mine = await call(settlementController.getMyCommission, { user: asUser('ownerA') });
    assert.strictEqual(mine.body.balance.balance, 60000);
    assert.ok(mine.body.open.payInfo.qrUrl.includes('970416-PLATFORM999'), 'QR phải trỏ về tài khoản nền tảng');
    assert.strictEqual(mine.body.open.payInfo.content, s.code, 'Nội dung chuyển khoản là mã hoá đơn');
    assert.strictEqual(mine.body.open.payInfo.amount, 60000);
    assert.strictEqual(M.Notification.rows.filter((n) => n.userId === 'ownerA').length, 1);
});

test('SF-02 · đã có hoá đơn mở thì KHÔNG lập thêm (409) — chủ sân chỉ có một hoá đơn mở', async () => {
    await seed({ bookings: 2 });
    await settlementService.issueSettlement('ownerA');
    const r = await call(settlementController.issueForOwner, { params: { id: 'ownerA' }, user: asUser('admin1') });
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(M.OwnerSettlement.rows.length, 1);
});

test('SF-03 · số dư dưới 1.000đ → không lập hoá đơn; chưa cấu hình tài khoản nền tảng → 409', async () => {
    await seed({ bookings: 0 });
    const r0 = await call(settlementController.issueForOwner, { params: { id: 'ownerA' }, user: asUser('admin1') });
    assert.strictEqual(r0.statusCode, 409);

    await seed({ bookings: 1 });
    state.settings.bankBin = ''; state.settings.bankAccountNumber = '';
    const r1 = await call(settlementController.issueForOwner, { params: { id: 'ownerA' }, user: asUser('admin1') });
    assert.strictEqual(r1.statusCode, 409);
    assert.ok(/tài khoản nền tảng/.test(r1.body.message));
    assert.strictEqual(M.OwnerSettlement.rows.length, 0);
});

test('SF-04 · nền tảng nợ chủ sân (khách dùng số dư): lập hoá đơn platform_pays tới tài khoản CHỦ SÂN', async () => {
    await seed({ bookings: 0 });
    await M.Booking.create({ _id: 'bk', venueId: 'venueA', status: 'confirmed', paymentMethod: 'credit', amount: 200000, ownerCommission: 20000, creditApplied: 200000 });
    const r = await settlementService.issueSettlement('ownerA');
    assert.strictEqual(r.settlement.direction, 'platform_pays');
    assert.strictEqual(r.settlement.amount, 180000);
    assert.strictEqual(r.settlement.payee.accountNumber, '111222333');
});

test('SF-05 · chủ sân vừa đổi tài khoản chưa xác minh → KHÔNG lập khoản nền tảng chuyển cho họ', async () => {
    await seed({ bookings: 0 });
    await M.Booking.create({ _id: 'bk', venueId: 'venueA', status: 'confirmed', paymentMethod: 'credit', amount: 200000, ownerCommission: 20000 });
    asUser('ownerA').bankInfoPendingReview = true;
    const r = await call(settlementController.issueForOwner, { params: { id: 'ownerA' }, user: asUser('admin1') });
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(M.OwnerSettlement.rows.length, 0);
});

// ---------- Báo chuyển / xác nhận ----------
test('SF-06 · chủ sân khác báo chuyển khoản hoá đơn của người khác → 404', async () => {
    await seed({ bookings: 1 });
    const { settlement } = await settlementService.issueSettlement('ownerA');
    const r = await call(settlementController.reportPaid, { params: { id: settlement._id }, body: {}, user: asUser('ownerB') });
    assert.strictEqual(r.statusCode, 404);
    assert.strictEqual(settlement.status, 'issued');
});

test('SF-07 · chủ sân báo chuyển nhiều lần → admin chỉ nhận MỘT thông báo', async () => {
    await seed({ bookings: 1 });
    const { settlement } = await settlementService.issueSettlement('ownerA');
    const before = M.Notification.rows.length;
    await Promise.all([
        call(settlementController.reportPaid, { params: { id: settlement._id }, body: { note: 'CK123' }, user: asUser('ownerA') }),
        call(settlementController.reportPaid, { params: { id: settlement._id }, body: {}, user: asUser('ownerA') }),
    ]);
    await call(settlementController.reportPaid, { params: { id: settlement._id }, body: {}, user: asUser('ownerA') });
    assert.strictEqual(settlement.status, 'reported');
    assert.strictEqual(M.Notification.rows.length - before, 1);
    assert.strictEqual(M.Notification.rows[before].userId, 'admin1');
});

test('SF-08 · admin xác nhận → hoá đơn paid, số dư về 0; xác nhận lại không đổi gì', async () => {
    await seed({ bookings: 2 });
    const { settlement } = await settlementService.issueSettlement('ownerA');
    await call(settlementController.reportPaid, { params: { id: settlement._id }, body: {}, user: asUser('ownerA') });
    const r1 = await call(settlementController.confirmSettlement, { params: { id: settlement._id }, user: asUser('admin1') });
    assert.strictEqual(r1.statusCode, 200);
    assert.strictEqual(settlement.status, 'paid');
    assert.strictEqual((await settlementService.computeBalance('ownerA')).balance, 0);

    const notifs = M.Notification.rows.length;
    const r2 = await call(settlementController.confirmSettlement, { params: { id: settlement._id }, user: asUser('admin1') });
    assert.strictEqual(r2.statusCode, 200);
    assert.strictEqual(M.Notification.rows.length, notifs, 'Xác nhận lại không được gửi thông báo thêm');
    assert.strictEqual((await settlementService.computeBalance('ownerA')).balance, 0);
});

test('SF-09 · sau khi đã nộp, phát sinh đơn mới → số dư chỉ gồm phần MỚI (không tính lại khoản đã nộp)', async () => {
    await seed({ bookings: 2 });
    const { settlement } = await settlementService.issueSettlement('ownerA');
    await call(settlementController.confirmSettlement, { params: { id: settlement._id }, user: asUser('admin1') });
    await M.Booking.create({ _id: 'bkNew', venueId: 'venueA', status: 'confirmed', paymentMethod: 'bank_transfer', amount: 200000, ownerCommission: 20000 });
    await M.Payment.create({ bookingId: 'bkNew', purpose: 'booking', amount: 200000, status: 'completed', receiver: { ownerId: 'ownerA' } });
    assert.strictEqual((await settlementService.computeBalance('ownerA')).balance, 20000);
    // và lập được hoá đơn mới vì hoá đơn cũ đã đóng
    const again = await settlementService.issueSettlement('ownerA');
    assert.strictEqual(again.settlement.amount, 20000);
});

test('SF-10 · admin từ chối (chưa thấy tiền) → về "chờ nộp", báo chủ sân; số dư KHÔNG đổi', async () => {
    await seed({ bookings: 1 });
    const { settlement } = await settlementService.issueSettlement('ownerA');
    await call(settlementController.reportPaid, { params: { id: settlement._id }, body: {}, user: asUser('ownerA') });
    const r = await call(settlementController.rejectSettlement, { params: { id: settlement._id }, body: { reason: 'Không thấy tiền' }, user: asUser('admin1') });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(settlement.status, 'issued');
    assert.strictEqual(settlement.rejectionNote, 'Không thấy tiền');
    assert.strictEqual((await settlementService.computeBalance('ownerA')).balance, 20000);
    assert.ok(M.Notification.rows.some((n) => n.userId === 'ownerA' && /Chưa xác nhận/.test(n.title)));
});

test('SF-11 · không từ chối được hoá đơn chủ sân CHƯA báo chuyển (409)', async () => {
    await seed({ bookings: 1 });
    const { settlement } = await settlementService.issueSettlement('ownerA');
    const r = await call(settlementController.rejectSettlement, { params: { id: settlement._id }, body: {}, user: asUser('admin1') });
    assert.strictEqual(r.statusCode, 409);
});

// ---------- Chặn nhận đặt mới khi nợ quá hạn ----------
const DAY = 24 * 3600 * 1000;
const overdue = async (daysPastDue, status = 'issued') => {
    await seed({ bookings: 1 });
    const { settlement } = await settlementService.issueSettlement('ownerA');
    settlement.status = status;
    settlement.dueDate = new Date(Date.now() - daysPastDue * DAY);
    return settlement;
};

test('SF-12 · quá hạn nhưng còn trong ân hạn 7 ngày → CHƯA bị chặn', async () => {
    await overdue(3);
    assert.strictEqual(await settlementService.isOwnerBlocked('ownerA'), false);
});

test('SF-13 · quá hạn + hết ân hạn → bị chặn; holdSlot trả 409 và không để lộ lý do công nợ', async () => {
    await overdue(10);
    assert.strictEqual(await settlementService.isOwnerBlocked('ownerA'), true);
    const r = await call(bookingController.holdSlot, {
        body: { venueId: 'venueA', courtId: 'c1', date: '2099-01-01', startTime: '18:00', endTime: '19:00' }, user: asUser('cust1'),
    });
    assert.strictEqual(r.statusCode, 409);
    assert.ok(!/hoa hồng|nợ/i.test(r.body.message), 'Không nói với khách chuyện công nợ của chủ sân');
});

test('SF-14 · đã báo chuyển khoản (chờ admin đối chiếu) → KHÔNG bị chặn dù quá hạn', async () => {
    await overdue(30, 'reported');
    assert.strictEqual(await settlementService.isOwnerBlocked('ownerA'), false);
});

test('SF-15 · tắt tính năng chặn trong cài đặt → không chặn; chủ sân khác không bị ảnh hưởng', async () => {
    await overdue(30);
    assert.strictEqual(await settlementService.isOwnerBlocked('ownerB'), false);
    state.settings.commissionBlockEnabled = false;
    assert.strictEqual(await settlementService.isOwnerBlocked('ownerA'), false);
});

test('SF-16 · nộp xong (admin xác nhận) → hết bị chặn ngay', async () => {
    const s = await overdue(30);
    assert.strictEqual(await settlementService.isOwnerBlocked('ownerA'), true);
    await call(settlementController.confirmSettlement, { params: { id: s._id }, user: asUser('admin1') });
    assert.strictEqual(await settlementService.isOwnerBlocked('ownerA'), false);
});

// ---------- Lập hoá đơn tự động ----------
test('SF-17 · tự lập đầu tháng: chỉ trong 3 ngày đầu, mỗi chủ sân một hoá đơn/tháng; tắt được trong cài đặt', async () => {
    await seed({ bookings: 2 });
    assert.strictEqual(await settlementService.autoIssueMonthly(new Date('2026-10-15T03:00:00')), 0, 'Giữa tháng không tự lập');
    assert.strictEqual(await settlementService.autoIssueMonthly(new Date('2026-11-02T03:00:00')), 1);
    assert.strictEqual(M.OwnerSettlement.rows.length, 1);
    assert.strictEqual(await settlementService.autoIssueMonthly(new Date('2026-11-02T09:00:00')), 0, 'Cùng ngày không lập lại');

    await seed({ bookings: 2 });
    state.settings.commissionAutoIssueEnabled = false;
    assert.strictEqual(await settlementService.autoIssueMonthly(new Date('2026-12-01T03:00:00')), 0);
});

// ---------- Hoàn tiền do CHỦ SÂN ----------
async function seedRefund() {
    await seed({ bookings: 1 });
    return refundService.createRefund({ amount: 150000, reason: 'Hoàn tiền huỷ đơn', bookingId: 'book1', customerId: 'cust1', prefix: 'CR' });
}

test('SF-18 · khoản hoàn của đơn khách chuyển THẲNG cho chủ sân → giao cho chủ sân, không ghi sổ cái nền tảng, báo cả khách lẫn chủ sân', async () => {
    const refund = await seedRefund();
    assert.strictEqual(refund.refundOwnerId, 'ownerA');
    assert.strictEqual(state.ledger.length, 0, 'Nền tảng không chi khoản này nên không ghi sổ');
    assert.ok(M.Notification.rows.some((n) => n.userId === 'ownerA' && /Cần hoàn tiền/.test(n.title)));
    assert.ok(M.Notification.rows.some((n) => n.userId === 'cust1' && /chủ sân/.test(n.message)));
});

test('SF-19 · khoản hoàn của chuyển sân do CHỦ SÂN CŨ (đang giữ tiền) hoàn, không có khoản nào do nền tảng hoàn', async () => {
    await seed({ bookings: 1 });
    const refund = await refundService.createRefund({ amount: 30000, reason: 'Hoàn chênh lệch khi chuyển sân', bookingId: 'book1', transferId: 't1', customerId: 'cust1', refundOwnerId: 'ownerA' });
    assert.strictEqual(refund.refundOwnerId, 'ownerA');
    assert.strictEqual(refund.purpose, 'transfer_refund');
    assert.strictEqual(state.ledger.length, 0);
});

test('SF-20 · chủ sân thấy khoản hoàn của mình; chủ sân khác và admin KHÔNG xử lý được', async () => {
    const refund = await seedRefund();
    const list = await call(paymentController.getOwnerRefunds, { user: asUser('ownerA') });
    assert.strictEqual(list.body.payments.length, 1);

    const other = await call(paymentController.ownerMarkRefunded, { params: { id: refund._id }, user: asUser('ownerB') });
    assert.strictEqual(other.statusCode, 404);
    assert.strictEqual(paymentController.markRefunded, undefined, 'Admin không có handler đánh dấu đã hoàn');
    assert.strictEqual(refund.status, 'refund_requested');
});

test('SF-21 · chủ sân bấm "Đã hoàn tiền" → khách được báo; bấm lại không báo thêm', async () => {
    const refund = await seedRefund();
    await call(paymentController.ownerMarkRefunded, { params: { id: refund._id }, user: asUser('ownerA') });
    assert.strictEqual(refund.status, 'refunded');
    const n = M.Notification.rows.length;
    await call(paymentController.ownerMarkRefunded, { params: { id: refund._id }, user: asUser('ownerA') });
    assert.strictEqual(M.Notification.rows.length, n);
});

test('SF-22 · không còn endpoint danh sách hoàn tiền cho admin; mọi khoản hoàn đều có chủ sân phụ trách', async () => {
    assert.strictEqual(paymentController.getPendingRefunds, undefined);
    await seedRefund();
    assert.ok(M.Payment.rows.filter((p) => p.status === 'refund_requested').every((p) => p.refundOwnerId));
});

test('SF-23 · khoản chủ sân đang nợ khách (chờ hoàn) KHÔNG bị tính là tiền chủ sân đang giữ', async () => {
    await seed({ bookings: 1 });
    M.Booking.rows[0].status = 'cancelled'; // chủ sân huỷ, không có trường hoàn trên đơn
    await refundService.createRefund({ amount: 200000, reason: 'Chủ sân huỷ đơn', bookingId: 'book1', customerId: 'cust1', prefix: 'OC' });
    assert.strictEqual((await settlementService.computeBalance('ownerA')).balance, 0);
});

// ---------- Phí dịch vụ theo từng đơn ----------
test('SF-24 · phí dịch vụ theo đơn = phần khách chịu + phần chủ sân chịu; chỉ đơn trong tháng, bỏ đơn tại quầy/đã chuyển/huỷ', async () => {
    await seed({ bookings: 0 });
    const mk = (o) => M.Booking.create({ venueId: 'venueA', status: 'confirmed', paymentMethod: 'bank_transfer', amount: 200000, serviceFee: 0, ownerCommission: 20000, startTime: '18:00', endTime: '19:00', ...o });
    await mk({ _id: 'b1', date: '2026-10-03' });
    await mk({ _id: 'b2', date: '2026-10-20', serviceFee: 10000, ownerCommission: 10000, status: 'completed' });
    await mk({ _id: 'b3', date: '2026-09-30' });                          // tháng khác
    await mk({ _id: 'b4', date: '2026-10-05', paymentMethod: 'manual' });  // thu tại quầy
    await mk({ _id: 'b5', date: '2026-10-06', status: 'transferred' });
    await mk({ _id: 'b6', date: '2026-10-07', status: 'cancelled' });
    const r = await settlementService.listFeeOrders('ownerA', '2026-10');
    assert.deepStrictEqual(r.orders.map((o) => o._id), ['b2', 'b1'], 'mới nhất lên trước');
    assert.deepStrictEqual(r.orders.map((o) => o.fee), [20000, 20000]);
    assert.strictEqual(r.totalFee, 40000);
    assert.strictEqual((await settlementService.listFeeOrders('ownerA', '2026-09')).totalFee, 20000);
});

test('SF-25 · API phí theo đơn: chủ sân chỉ thấy đơn của địa điểm mình; tháng sai định dạng → tháng hiện tại', async () => {
    await seed({ bookings: 0 });
    await M.Booking.create({ _id: 'b1', venueId: 'venueA', date: '2026-10-03', startTime: '18:00', endTime: '19:00', status: 'confirmed', paymentMethod: 'bank_transfer', amount: 100000, ownerCommission: 10000 });
    const a = await call(settlementController.getMyFeeOrders, { query: { month: '2026-10' }, user: asUser('ownerA') });
    const b = await call(settlementController.getMyFeeOrders, { query: { month: '2026-10' }, user: asUser('ownerB') });
    assert.strictEqual(a.body.orders.length, 1);
    assert.strictEqual(b.body.orders.length, 0);
    const bad = await call(settlementController.getMyFeeOrders, { query: { month: 'abc' }, user: asUser('ownerA') });
    assert.ok(/^\d{4}-\d{2}$/.test(bad.body.month));
});

test('SF-26 · API chủ sân: có hạn nộp, ngày khoá (hạn + ân hạn), chính sách 7+3=10 ngày; chữ dùng "phí dịch vụ", không có "nợ bạn"', async () => {
    await seed({ bookings: 1 });
    state.settings.commissionGraceDays = 3;
    const { settlement } = await settlementService.issueSettlement('ownerA');
    const mine = await call(settlementController.getMyCommission, { user: asUser('ownerA') });
    assert.strictEqual(mine.body.policy.dueDays, 7);
    assert.strictEqual(mine.body.policy.lockDays, 10);
    const lock = new Date(mine.body.open.lockDate).getTime();
    assert.strictEqual(lock - new Date(settlement.dueDate).getTime(), 3 * DAY);
    const msg = M.Notification.rows.find((n) => n.userId === 'ownerA');
    assert.ok(/Phí dịch vụ/.test(msg.title + msg.message), msg.message);
    assert.ok(/khoá/.test(msg.message), 'thông báo nói rõ sẽ khoá địa điểm');
    assert.ok(!/nợ bạn|nền tảng nợ/i.test(JSON.stringify(M.Notification.rows)));
});

// ---------- Tự động xác nhận qua sao kê ngân hàng ----------
const issue60 = async () => { await seed({ bookings: 3 }); return (await settlementService.issueSettlement('ownerA')).settlement; };

test('SF-27 · tiền về đủ + đúng mã hoá đơn → hoá đơn "paid" tự động, số dư về 0, popup nhắc hết (không còn hoá đơn mở)', async () => {
    const s = await issue60();
    const r = await settlementService.autoConfirmFromBank({ txnId: 'T1', amount: 60000, content: `NGUYEN VAN A chuyen ${s.code.toLowerCase()} phi dich vu`, accountNumber: 'PLATFORM999' });
    assert.strictEqual(r.status, 'confirmed');
    assert.strictEqual(s.status, 'paid');
    assert.strictEqual(s.autoConfirmed, true);
    assert.ok(!s.confirmedBy, 'không có admin nào xác nhận');
    assert.strictEqual((await settlementService.computeBalance('ownerA')).balance, 0);
    const mine = await call(settlementController.getMyCommission, { user: asUser('ownerA') });
    assert.strictEqual(mine.body.open, null);
    assert.ok(M.Notification.rows.some((n) => n.userId === 'ownerA' && /tự động/.test(n.message)));
});

test('SF-28 · ngân hàng chèn dấu cách/gạch vào nội dung vẫn khớp mã; chuyển dư tiền vẫn đóng hoá đơn', async () => {
    const s = await issue60();
    const spaced = s.code.replace(/^(HH\d{6})(.{6})(.*)$/, '$1 - $2 $3');
    const r = await settlementService.autoConfirmFromBank({ txnId: 'T9', amount: 65000, content: `MBVCB.123.${spaced}.CT tu 0123`, accountNumber: 'PLATFORM999' });
    assert.strictEqual(r.status, 'confirmed');
    assert.strictEqual(s.status, 'paid');
});

test('SF-29 · chuyển thiếu → cộng dồn, báo chủ sân số còn thiếu; chuyển nốt bằng giao dịch khác → đóng hoá đơn', async () => {
    const s = await issue60();
    const p = await settlementService.autoConfirmFromBank({ txnId: 'A', amount: 25000, content: s.code, accountNumber: 'PLATFORM999' });
    assert.strictEqual(p.status, 'partial');
    assert.strictEqual(s.status, 'issued');
    assert.strictEqual(s.receivedAmount, 25000);
    assert.ok(M.Notification.rows.some((n) => /còn thiếu 35\.000đ/.test(n.message)));
    const done = await settlementService.autoConfirmFromBank({ txnId: 'B', amount: 35000, content: s.code, accountNumber: 'PLATFORM999' });
    assert.strictEqual(done.status, 'confirmed');
    assert.strictEqual(s.status, 'paid');
});

test('SF-30 · webhook bắn lại cùng mã giao dịch → chỉ cộng MỘT lần; hoá đơn đã đóng thì không khớp nữa', async () => {
    const s = await issue60();
    await settlementService.autoConfirmFromBank({ txnId: 'DUP', amount: 20000, content: s.code, accountNumber: 'PLATFORM999' });
    const again = await settlementService.autoConfirmFromBank({ txnId: 'DUP', amount: 20000, content: s.code, accountNumber: 'PLATFORM999' });
    assert.strictEqual(again.status, 'duplicate');
    assert.strictEqual(s.receivedAmount, 20000);
    await settlementService.autoConfirmFromBank({ txnId: 'FULL', amount: 40000, content: s.code, accountNumber: 'PLATFORM999' });
    assert.strictEqual(s.status, 'paid');
    const late = await settlementService.autoConfirmFromBank({ txnId: 'FULL', amount: 40000, content: s.code, accountNumber: 'PLATFORM999' });
    assert.strictEqual(late.status, 'no_match');
    assert.strictEqual(s.receivedAmount, 60000, 'số tiền ghi nhận không đổi');
});

test('SF-31 · không khớp: sai mã, vào tài khoản khác, tiền ra, số tiền 0 → không đụng hoá đơn nào', async () => {
    const s = await issue60();
    const base = { txnId: 'X', amount: 60000, accountNumber: 'PLATFORM999' };
    assert.strictEqual((await settlementService.autoConfirmFromBank({ ...base, content: 'HH000000ZZZZZZ999' })).status, 'no_match');
    assert.strictEqual((await settlementService.autoConfirmFromBank({ ...base, content: s.code, accountNumber: '999000111' })).status, 'no_match');
    assert.strictEqual((await settlementService.autoConfirmFromBank({ ...base, content: s.code, direction: 'out' })).status, 'ignored');
    assert.strictEqual((await settlementService.autoConfirmFromBank({ ...base, content: s.code, amount: 0 })).status, 'ignored');
    assert.strictEqual(s.status, 'issued');
    assert.strictEqual(s.receivedAmount, 0);
});

test('SF-32 · hoá đơn đã báo chuyển khoản (reported) mà tiền về → vẫn tự đóng, không cần admin', async () => {
    const s = await issue60();
    await call(settlementController.reportPaid, { params: { id: s._id }, body: {}, user: asUser('ownerA') });
    assert.strictEqual(s.status, 'reported');
    const r = await settlementService.autoConfirmFromBank({ txnId: 'R1', amount: 60000, content: s.code });
    assert.strictEqual(r.status, 'confirmed');
});

// ---------- Webhook HTTP ----------
const hook = (body, key) => call(settlementController.bankWebhook, { body, headers: key === undefined ? {} : { authorization: `Apikey ${key}` } });

test('SF-33 · webhook: chưa cấu hình khoá → 503; sai khoá → 401 và không đổi gì; đúng khoá (payload SePay) → tự xác nhận', async () => {
    const s = await issue60();
    const payload = { id: 777, transferType: 'in', transferAmount: 60000, content: `thanh toan ${s.code}`, accountNumber: 'PLATFORM999' };
    delete process.env.BANK_WEBHOOK_SECRET;
    assert.strictEqual((await hook(payload, 'k')).statusCode, 503);
    process.env.BANK_WEBHOOK_SECRET = 'secret-key-1234567890';
    assert.strictEqual((await hook(payload, 'sai')).statusCode, 401);
    assert.strictEqual((await hook(payload)).statusCode, 401);
    assert.strictEqual(s.status, 'issued');
    const ok = await hook(payload, 'secret-key-1234567890');
    assert.strictEqual(ok.statusCode, 200);
    assert.strictEqual(ok.body.result, 'confirmed');
    assert.strictEqual(s.status, 'paid');
    // bắn lại → vẫn 200 (để nhà cung cấp không thử lại mãi), không cộng thêm
    const replay = await hook(payload, 'secret-key-1234567890');
    assert.strictEqual(replay.statusCode, 200);
    assert.strictEqual(replay.body.result, 'no_match');
    delete process.env.BANK_WEBHOOK_SECRET;
});

test('SF-34 · webhook đọc được cả payload Casso; giao dịch tiền ra bị bỏ qua', async () => {
    const s = await issue60();
    process.env.BANK_WEBHOOK_SECRET = 'k-casso-1234567890';
    const out = await call(settlementController.bankWebhook, { body: { data: { id: 5, amount: -60000, description: s.code } }, headers: { 'secure-token': 'k-casso-1234567890' } });
    assert.strictEqual(out.body.result, 'ignored');
    const inn = await call(settlementController.bankWebhook, { body: { error: 0, data: { id: 6, amount: 60000, description: s.code } }, headers: { 'secure-token': 'k-casso-1234567890' } });
    assert.strictEqual(inn.body.result, 'confirmed');
    delete process.env.BANK_WEBHOOK_SECRET;
});

// ---------- Nhắc hạn & khoá địa điểm ----------
test('SF-35 · nhắc hạn theo 3 bậc (sắp đến hạn → quá hạn → đã khoá), mỗi bậc chỉ một thông báo dù chạy nhiều lần', async () => {
    const s = await issue60();
    state.settings.commissionGraceDays = 3;
    const due = new Date(s.dueDate).getTime();
    const count = () => M.Notification.rows.filter((n) => n.userId === 'ownerA').length;
    const base = count(); // thông báo lập hoá đơn

    assert.strictEqual(await settlementService.sendFeeReminders(new Date(due - 5 * DAY)), 0, 'còn xa hạn: chưa nhắc');
    assert.strictEqual(await settlementService.sendFeeReminders(new Date(due - 1 * DAY)), 1);
    assert.strictEqual(await settlementService.sendFeeReminders(new Date(due - 0.5 * DAY)), 0, 'bậc 1 không gửi lại');
    assert.strictEqual(await settlementService.sendFeeReminders(new Date(due + 1 * DAY)), 1);
    assert.strictEqual(await settlementService.sendFeeReminders(new Date(due + 4 * DAY)), 1);
    assert.strictEqual(await settlementService.sendFeeReminders(new Date(due + 9 * DAY)), 0, 'đã ở bậc cao nhất');
    assert.strictEqual(count() - base, 3);
    const last = M.Notification.rows.filter((n) => n.userId === 'ownerA').pop();
    assert.ok(/khoá/.test(last.title), last.title);
});

test('SF-36 · hoá đơn đã đóng thì không còn nhắc; tắt chặn thì không báo "đã khoá"', async () => {
    const s = await issue60();
    await settlementService.autoConfirmFromBank({ txnId: 'Z', amount: 60000, content: s.code });
    const n = M.Notification.rows.length;
    assert.strictEqual(await settlementService.sendFeeReminders(new Date(Date.now() + 30 * DAY)), 0);
    assert.strictEqual(M.Notification.rows.length, n);

    const s2 = await issue60();
    state.settings.commissionBlockEnabled = false;
    await settlementService.sendFeeReminders(new Date(new Date(s2.dueDate).getTime() + 30 * DAY));
    assert.ok(!M.Notification.rows.some((x) => /đã bị khoá/.test(x.title)));
});

test('SF-37 · danh sách chủ sân bị khoá: có sau hết ân hạn, mất khi đã nộp hoặc tắt chặn', async () => {
    const s = await overdue(10);
    state.settings.commissionGraceDays = 3;
    assert.deepStrictEqual((await settlementService.blockedOwnerIds()).map(String), ['ownerA']);
    await settlementService.autoConfirmFromBank({ txnId: 'Q', amount: s.amount, content: s.code });
    assert.deepStrictEqual(await settlementService.blockedOwnerIds(), []);
    const s2 = await overdue(10);
    state.settings.commissionBlockEnabled = false;
    assert.deepStrictEqual(await settlementService.blockedOwnerIds(), []);
    void s2;
});

test('SF-38 · hoá đơn "nền tảng chuyển cho chủ sân" không bị webhook tiền vào đóng nhầm', async () => {
    await seed({ bookings: 1 });
    M.Booking.rows[0].amount = 100000; M.Booking.rows[0].ownerCommission = 0; M.Payment.rows[0].amount = 80000; // thiếu tiền → nền tảng nợ
    const { settlement } = await settlementService.issueSettlement('ownerA');
    assert.strictEqual(settlement.direction, 'platform_pays');
    const r = await settlementService.autoConfirmFromBank({ txnId: 'P', amount: settlement.amount, content: settlement.code });
    assert.strictEqual(r.status, 'no_match');
    assert.strictEqual(settlement.status, 'issued');
});

(async () => {
    console.log('\n=== ĐỐI SOÁT HOA HỒNG & HOÀN TIỀN DO CHỦ SÂN ===\n');
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (err) { console.log(`  ✗ ${name}\n    ${err.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
