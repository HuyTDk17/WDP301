/**
 * KIỂM THỬ LUỒNG CHUYỂN KHOẢN ĐẶT SÂN — TIỀN VÀO TÀI KHOẢN CHỦ SÂN, CHỦ SÂN XÁC NHẬN.
 *
 * Không cần MongoDB: các model được thay bằng bản giả trong bộ nhớ (nhét thẳng
 * vào require.cache TRƯỚC khi nạp paymentController), còn bankTransfer và
 * asyncHandler là mã thật. Mục đích là khoá chặt các quy tắc phân quyền:
 *
 *   • Khách thấy TÀI KHOẢN CHỦ SÂN, không bao giờ thấy tài khoản của nền tảng.
 *   • Chỉ đúng chủ sân nhận tiền mới xác nhận/từ chối được (chủ sân khác → 404).
 *   • Quản trị viên KHÔNG xác nhận/từ chối được giao dịch đặt sân (→ 403) —
 *     chỉ xử lý khoản nhận bằng tài khoản nền tảng (bù chuyển sân, giao dịch cũ).
 *   • Webhook đối soát (theo dõi tài khoản nền tảng) không đụng tới đơn đặt sân.
 *
 * Phần cần CSDL thật (ghi/đọc Mongo thật) vẫn nên kiểm thử tích hợp riêng.
 */
const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

// ---------- Bản giả ----------
const resolve = (rel) => require.resolve(path.join(__dirname, '..', rel));
function fake(rel, exports) {
    const filename = resolve(rel);
    require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
/** Promise có thêm .select()/.populate()/.sort() trả về chính nó — đủ cho cách controller gọi. */
function q(value) {
    const p = Promise.resolve(value);
    p.select = () => q(value);
    p.populate = () => q(value);
    p.sort = () => q(value);
    p.limit = () => q(value);
    return p;
}

const state = {};
function reset() {
    Object.assign(state, {
        payments: [], bookings: [], users: [], venues: [],
        notifications: [], findFilters: [], ledgerCalls: 0,
        settings: {
            bankTransferWindowMinutes: 30,             bankBin: '970416', bankAccountNumber: 'PLATFORM999', bankAccountName: 'NEN TANG', bankName: 'ACB',
        },
    });
}
const id = (n) => `id${n}`;
const OPEN = ['pending', 'awaiting_confirmation'];

/** Bộ so khớp tối giản cho các toán tử mà controller thật sự dùng: $in, $ne, $lt, đường dẫn 'a.b'. */
function getPath(doc, key) {
    return key.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);
}
function matches(doc, filter = {}) {
    return Object.entries(filter).every(([key, cond]) => {
        const v = getPath(doc, key);
        if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('$in' in cond) return cond.$in.map(String).includes(String(v));
            if ('$ne' in cond) return String(v) !== String(cond.$ne);
            if ('$lt' in cond) return v < cond.$lt;
            return true;
        }
        if (cond === null) return v == null;
        return String(v) === String(cond);
    });
}

/** Giả pre('save') của Payment: duy trì openKey đúng như models/Payment.js. */
function applyOpenKey(d) {
    d.openKey = (d.purpose === 'booking' && d.bookingId && OPEN.includes(d.status))
        ? `booking:${d.bookingId}` : undefined;
}
const makeDoc = (data) => ({
    ...data,
    save: async function () { if ('purpose' in this && 'orderRef' in this) applyOpenKey(this); return this; },
});

fake('models/Payment.js', {
    findById: (pid) => q(state.payments.find((p) => p._id === pid) || null),
    find: (filter) => { state.findFilters.push(filter); return q(state.payments.filter((p) => matches(p, filter))); },
    findOne: (filter) => q([...state.payments].reverse().find((p) => matches(p, filter)) || null),
    exists: (filter) => q(state.payments.find((p) => matches(p, filter)) ? { _id: 'x' } : null),
    // Giả unique index `openKey`: tạo giao dịch mở thứ hai cho cùng một đơn → E11000
    create: async (data) => {
        // purpose mặc định 'booking' như schema thật
        const d = makeDoc({ _id: id('pay' + (state.payments.length + 1)), purpose: 'booking', ...data });
        applyOpenKey(d);
        if (d.openKey && state.payments.some((p) => p.openKey === d.openKey)) {
            const err = new Error('E11000 duplicate key'); err.code = 11000; throw err;
        }
        state.payments.push(d);
        return d;
    },
    // Giả thao tác nguyên tử của Mongo: khớp + sửa trong MỘT bước đồng bộ
    findOneAndUpdate: async (filter, update) => {
        const doc = state.payments.find((p) => matches(p, filter));
        if (!doc) return null;
        Object.assign(doc, update.$set || {});
        Object.keys(update.$unset || {}).forEach((k) => { doc[k] = undefined; });
        if (update.$set?.status) applyOpenKey(doc);
        return doc;
    },
});
fake('models/Booking.js', {
    findById: (bid) => q(state.bookings.find((b) => b._id === bid) || null),
    find: (filter) => q(state.bookings.filter((b) => matches(b, filter))),
});
fake('models/TransferRequest.js', { findById: () => q(null) });
fake('models/User.js', {
    findById: (uid) => q(state.users.find((u) => u._id === uid) || null),
    find: (f) => q(state.users.filter((u) => !f?.role || u.role === f.role)),
});
fake('models/Notification.js', {
    create: async (n) => { state.notifications.push(n); return n; },
    insertMany: async (list) => { state.notifications.push(...list); return list; },
});
fake('models/Venue.js', { findById: (vid) => q(state.venues.find((v) => v._id === vid) || null) });
fake('models/Court.js', {});
fake('models/Hold.js', {});
fake('controllers/promotionController.js', { validateAndCalculateDiscount: async () => ({ valid: false }) });
fake('services/transferService.js', {});
// Chặn nhận đặt mới khi chủ sân nợ hoa hồng quá hạn — có test riêng ở settlementFlow.test.js
fake('services/settlementService.js', { isOwnerBlocked: async () => false, autoIssueMonthly: async () => 0 });
fake('utils/platformSettings.js', { getSettings: async () => state.settings, getCommissionRate: async () => 0.1 });
fake('utils/ledger.js', { bookingEntries: () => [], record: async () => { state.ledgerCalls += 1; return []; } });
fake('utils/slotLock.js', { acquire: async () => ({}), release: async () => {} });
fake('utils/credit.js', {
    reserve: async () => 0, release: async () => {},
    splitRefund: (refund) => ({ cash: refund, credit: 0 }),
});

const paymentController = require('../controllers/paymentController');
const bookingController = require('../controllers/bookingController');
const jobs = require('../jobs/index');

function call(handler, { params = {}, body = {}, user, headers = {} } = {}) {
    return new Promise((resolveCall, reject) => {
        const res = {
            statusCode: 200, body: undefined,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; resolveCall(this); return this; },
            end() { resolveCall(this); return this; },
        };
        handler({ params, body, user, headers }, res, reject);
    });
}

// ---------- Dữ liệu mẫu ----------
function seed({ ownerHasBank = true } = {}) {
    reset();
    state.users.push(
        { _id: 'ownerA', role: 'owner', name: 'Chu San A', bankName: 'ACB', bankBin: ownerHasBank ? '970416' : '', bankAccount: ownerHasBank ? '111222333' : '', bankAccountName: 'CHU SAN A' },
        { _id: 'ownerB', role: 'owner', name: 'Chu San B' },
        { _id: 'cust1', role: 'customer' },
        { _id: 'admin1', role: 'admin' },
    );
    state.venues.push({ _id: 'venueA', ownerId: 'ownerA' });
    state.bookings.push(makeDoc({
        _id: 'book1', customerId: 'cust1', venueId: 'venueA', venueName: 'Sân A', courtName: 'Sân 1',
        status: 'awaiting_payment', amount: 200000, serviceFee: 10000, discountAmount: 0,
        creditApplied: 0, pointsUsed: 0, pointsApplied: 0, courtId: 'c1', date: '2026-10-10', startTime: '18:00', endTime: '19:00',
    }));
}
/** Giao dịch nhận bằng tài khoản chủ sân A (đơn đặt sân mới). */
function ownerPayment(extra = {}) {
    const p = makeDoc({
        _id: 'payOwner', bookingId: 'book1', purpose: 'booking', method: 'bank_transfer', amount: 210000,
        status: 'awaiting_confirmation', orderRef: 'SV123', receiver: { ownerId: 'ownerA', accountNumber: '111222333' }, ...extra,
    });
    state.payments.push(p);
    return p;
}
/** Giao dịch nhận bằng tài khoản nền tảng (cũ / bù chuyển sân) — không có receiver. */
function platformPayment(extra = {}) {
    const p = makeDoc({
        _id: 'payPlatform', bookingId: 'book1', purpose: 'booking', method: 'bank_transfer', amount: 210000,
        status: 'awaiting_confirmation', orderRef: 'SV999', receiver: null, ...extra,
    });
    state.payments.push(p);
    return p;
}
const asUser = (uid) => state.users.find((u) => u._id === uid);

// ---------- Kiểm thử ----------
test('OP-01 · checkout: khách thấy tài khoản CHỦ SÂN, tuyệt đối không có tài khoản nền tảng', async () => {
    seed();
    const res = await call(paymentController.checkout, { body: { bookingId: 'book1', useCredit: false }, user: asUser('cust1') });
    assert.strictEqual(res.statusCode, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.bankTransfer.accountNumber, '111222333');
    assert.strictEqual(res.body.bankTransfer.accountName, 'CHU SAN A');
    assert.ok(!JSON.stringify(res.body).includes('PLATFORM999'), 'Lộ số tài khoản của nền tảng ra cho khách');
    assert.ok(res.body.bankTransfer.qrUrl.includes('970416-111222333'), 'Mã QR phải trỏ về tài khoản chủ sân');
    assert.strictEqual(state.payments[0].receiver.ownerId, 'ownerA', 'Phải lưu lại chủ sân nhận tiền');
    assert.strictEqual(state.payments[0].receiver.accountNumber, '111222333');
});

test('OP-02 · checkout: chủ sân CHƯA có tài khoản → 409, không dùng tài khoản nền tảng thay thế', async () => {
    seed({ ownerHasBank: false });
    const res = await call(paymentController.checkout, { body: { bookingId: 'book1', useCredit: false }, user: asUser('cust1') });
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(state.payments.length, 0, 'Không được tạo giao dịch khi chưa có nơi nhận tiền');
    assert.ok(!JSON.stringify(res.body).includes('PLATFORM999'));
});

test('OP-03 · chủ sân đúng xác nhận → giao dịch completed, đơn confirmed, ghi nhận người xác nhận', async () => {
    seed();
    const p = ownerPayment();
    const res = await call(paymentController.ownerConfirmBankTransfer, { params: { id: 'payOwner' }, user: asUser('ownerA') });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(p.status, 'completed');
    assert.strictEqual(p.bankConfirmedBy, 'ownerA');
    assert.strictEqual(state.bookings[0].status, 'confirmed');
});

test('OP-04 · chủ sân KHÁC xác nhận → 404 và giao dịch không đổi', async () => {
    seed();
    const p = ownerPayment();
    const res = await call(paymentController.ownerConfirmBankTransfer, { params: { id: 'payOwner' }, user: asUser('ownerB') });
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(p.status, 'awaiting_confirmation');
    assert.strictEqual(state.bookings[0].status, 'awaiting_payment');
});

test('OP-05 · chủ sân KHÔNG xác nhận được giao dịch nhận bằng tài khoản nền tảng', async () => {
    seed();
    const p = platformPayment();
    const res = await call(paymentController.ownerConfirmBankTransfer, { params: { id: 'payPlatform' }, user: asUser('ownerA') });
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(p.status, 'awaiting_confirmation');
});

test('OP-06 · ADMIN KHÔNG còn bất kỳ handler nào xác nhận / từ chối / hoàn tiền / webhook thanh toán', () => {
    for (const name of ['confirmBankTransfer', 'rejectBankTransfer', 'getPendingBankPayments', 'markRefunded', 'getPendingRefunds', 'bankWebhook']) {
        assert.strictEqual(paymentController[name], undefined, `paymentController.${name} không được tồn tại`);
    }
});

test('OP-07 · route regression: adminRoutes / paymentRoutes không mở lại luồng booking-thanh toán-hoàn tiền-chuyển sân cho admin', () => {
    const fs = require('fs');
    const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminRoutes.js'), 'utf8');
    for (const forbidden of ["'/payments", "'/transfers", "'/bookings", "'/refunds", 'force-resolve', 'confirm-bank-transfer', 'reject-bank-transfer', 'markRefunded']) {
        assert.ok(!adminSrc.includes(forbidden), `adminRoutes.js không được chứa ${forbidden}`);
    }
    assert.ok(adminSrc.includes("'/commissions'"), 'admin vẫn có báo cáo hoa hồng chỉ đọc');
    const paySrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'paymentRoutes.js'), 'utf8');
    assert.ok(!paySrc.includes('webhook'), 'paymentRoutes.js không còn webhook đối soát');
    const txSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'transferRoutes.js'), 'utf8');
    assert.ok(!/authorize\(['"]admin['"]\)/.test(txSrc), 'transferRoutes.js không có route dành riêng cho admin');
});

test('OP-08 · admin không xem được giao dịch / hoàn tiền của người khác qua getPaymentStatus, requestRefund', async () => {
    seed();
    ownerPayment({ status: 'completed' });
    const r1 = await call(paymentController.getPaymentStatus, { params: { bookingId: 'book1' }, user: { ...asUser('admin1'), role: 'admin' } });
    assert.strictEqual(r1.statusCode, 403);
    const r2 = await call(paymentController.requestRefund, { params: { id: 'payOwner' }, body: {}, user: { ...asUser('admin1'), role: 'admin' } });
    assert.strictEqual(r2.statusCode, 403);
});

test('OP-09 · danh sách chờ của chủ sân: chỉ lọc theo CHÍNH MÌNH, gồm đặt sân và bù tiền chuyển sân', async () => {
    seed();
    await call(paymentController.getOwnerPendingBankPayments, { user: asUser('ownerA') });
    const [ownerFilter] = state.findFilters;
    assert.strictEqual(ownerFilter['receiver.ownerId'], 'ownerA');
    assert.deepStrictEqual(ownerFilter.purpose, { $in: ['booking', 'transfer_topup'] });
    assert.strictEqual(ownerFilter.status, 'awaiting_confirmation', 'Chủ sân chỉ thấy giao dịch khách ĐÃ báo chuyển khoản');
});

test('OP-10 · khách báo đã chuyển: thông báo tới CHỦ SÂN, không tới admin', async () => {
    seed();
    const p = ownerPayment({ status: 'pending' });
    const res = await call(paymentController.markTransferred, { params: { id: 'payOwner' }, user: asUser('cust1') });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(p.status, 'awaiting_confirmation');
    assert.deepStrictEqual(state.notifications.map((n) => n.userId), ['ownerA']);
    assert.strictEqual(state.notifications[0].link, '/owner/payments/pending');
});

test('OP-11 · giao dịch không có chủ sân nhận (dữ liệu cũ): khách báo đã chuyển → KHÔNG thông báo cho admin', async () => {
    seed();
    platformPayment({ status: 'pending' });
    await call(paymentController.markTransferred, { params: { id: 'payPlatform' }, user: asUser('cust1') });
    assert.deepStrictEqual(state.notifications.map((n) => n.userId), []);
});

test('OP-12 · chủ sân từ chối → giao dịch failed, báo khách, hướng khách liên hệ chủ sân', async () => {
    seed();
    const p = ownerPayment();
    const res = await call(paymentController.ownerRejectBankTransfer, { params: { id: 'payOwner' }, body: { reason: 'Không thấy tiền' }, user: asUser('ownerA') });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(p.status, 'failed');
    assert.strictEqual(state.notifications.length, 1);
    assert.strictEqual(state.notifications[0].userId, 'cust1');
    assert.ok(state.notifications[0].message.includes('liên hệ chủ sân'));
});

test('OP-13 · không còn webhook đối soát vào tài khoản nền tảng', () => {
    assert.strictEqual(paymentController.bankWebhook, undefined);
});


// ============================================================
// KHÔNG TRÙNG GIAO DỊCH: mỗi đơn chỉ một giao dịch mở, khách chỉ chuyển một lần
// ============================================================
const checkoutBody = { bookingId: 'book1', useCredit: false };

test('OP-14 · bấm thanh toán nhiều lần → CÙNG một giao dịch, cùng mã/QR, không tạo thêm', async () => {
    seed();
    const r1 = await call(paymentController.checkout, { body: checkoutBody, user: asUser('cust1') });
    const r2 = await call(paymentController.checkout, { body: checkoutBody, user: asUser('cust1') });
    const r3 = await call(paymentController.checkout, { body: checkoutBody, user: asUser('cust1') });
    assert.strictEqual(state.payments.length, 1, 'Chỉ được có MỘT giao dịch cho một đơn');
    assert.strictEqual(r1.statusCode, 201);
    assert.strictEqual(r2.statusCode, 200);
    assert.strictEqual(r2.body.paymentId, r1.body.paymentId);
    assert.strictEqual(r3.body.bankTransfer.content, r1.body.bankTransfer.content, 'Nội dung chuyển khoản phải giữ nguyên');
    assert.strictEqual(r3.body.bankTransfer.qrUrl, r1.body.bankTransfer.qrUrl, 'Mã QR phải giữ nguyên');
});

test('OP-15 · hai yêu cầu thanh toán ĐỒNG THỜI (bấm đúp/hai tab) → vẫn chỉ một giao dịch', async () => {
    seed();
    const [a, b] = await Promise.all([
        call(paymentController.checkout, { body: checkoutBody, user: asUser('cust1') }),
        call(paymentController.checkout, { body: checkoutBody, user: asUser('cust1') }),
    ]);
    assert.strictEqual(state.payments.length, 1, `Có ${state.payments.length} giao dịch`);
    assert.strictEqual(a.body.paymentId, b.body.paymentId);
});

test('OP-16 · khách bấm "Tôi đã chuyển khoản" nhiều lần → chủ sân chỉ nhận MỘT thông báo', async () => {
    seed();
    await call(paymentController.checkout, { body: checkoutBody, user: asUser('cust1') });
    const pid = state.payments[0]._id;
    const [r1, r2] = await Promise.all([
        call(paymentController.markTransferred, { params: { id: pid }, user: asUser('cust1') }),
        call(paymentController.markTransferred, { params: { id: pid }, user: asUser('cust1') }),
    ]);
    await call(paymentController.markTransferred, { params: { id: pid }, user: asUser('cust1') });
    assert.strictEqual(r1.statusCode, 200); assert.strictEqual(r2.statusCode, 200);
    assert.strictEqual(state.notifications.filter((n) => n.userId === 'ownerA').length, 1, 'Chủ sân bị báo nhiều lần cho một đơn');
});

test('OP-17 · khách ĐÃ báo chuyển rồi mở lại thanh toán → alreadyReported, vẫn cùng giao dịch', async () => {
    seed();
    await call(paymentController.checkout, { body: checkoutBody, user: asUser('cust1') });
    const first = state.payments[0];
    await call(paymentController.markTransferred, { params: { id: first._id }, user: asUser('cust1') });
    const again = await call(paymentController.checkout, { body: checkoutBody, user: asUser('cust1') });
    assert.strictEqual(again.body.alreadyReported, true, 'Phải báo cho giao diện biết để ẩn mã QR');
    assert.strictEqual(again.body.paymentId, first._id);
    assert.strictEqual(state.payments.length, 1);
});

test('OP-18 · danh sách chủ sân: giao dịch chưa báo bị ẩn, mỗi đơn đúng MỘT dòng (kể cả dữ liệu cũ trùng)', async () => {
    seed();
    // Dữ liệu cũ lỡ có 3 giao dịch cho cùng một đơn: 1 chưa báo + 2 đã báo
    ownerPayment({ _id: 'p-a', orderRef: 'A', status: 'pending' });
    ownerPayment({ _id: 'p-b', orderRef: 'B', status: 'awaiting_confirmation' });
    ownerPayment({ _id: 'p-c', orderRef: 'C', status: 'awaiting_confirmation' });
    const res = await call(paymentController.getOwnerPendingBankPayments, { user: asUser('ownerA') });
    assert.strictEqual(res.body.payments.length, 1, `Chủ sân thấy ${res.body.payments.length} dòng cho 1 đơn`);
    assert.notStrictEqual(res.body.payments[0].status, 'pending');
});

test('OP-19 · chủ sân xác nhận → các giao dịch trùng của đơn bị đóng; bấm xác nhận lần nữa không ghi sổ lại', async () => {
    seed();
    ownerPayment({ _id: 'p-a', orderRef: 'A', status: 'pending' });
    ownerPayment({ _id: 'p-b', orderRef: 'B', status: 'awaiting_confirmation' });
    const r1 = await call(paymentController.ownerConfirmBankTransfer, { params: { id: 'p-b' }, user: asUser('ownerA') });
    assert.strictEqual(r1.statusCode, 200, JSON.stringify(r1.body));
    const byId = Object.fromEntries(state.payments.map((p) => [p._id, p]));
    assert.strictEqual(byId['p-b'].status, 'completed');
    assert.strictEqual(byId['p-a'].status, 'failed', 'Giao dịch trùng phải bị đóng, không để chủ sân xử lý lần hai');
    assert.strictEqual(state.bookings[0].status, 'confirmed');

    const r2 = await call(paymentController.ownerConfirmBankTransfer, { params: { id: 'p-b' }, user: asUser('ownerA') });
    assert.strictEqual(r2.statusCode, 200);
    assert.strictEqual(state.ledgerCalls, 1, 'Bấm xác nhận lại không được ghi sổ cái lần hai');
});

test('OP-20 · hai lần bấm xác nhận ĐỒNG THỜI → onPaymentSucceeded chỉ chạy một lần', async () => {
    seed();
    ownerPayment({ _id: 'p-b', orderRef: 'B', status: 'awaiting_confirmation' });
    const [a, b] = await Promise.all([
        call(paymentController.ownerConfirmBankTransfer, { params: { id: 'p-b' }, user: asUser('ownerA') }),
        call(paymentController.ownerConfirmBankTransfer, { params: { id: 'p-b' }, user: asUser('ownerA') }),
    ]);
    assert.strictEqual(state.ledgerCalls, 1, `Sổ cái bị ghi ${state.ledgerCalls} lần`);
    assert.deepStrictEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
});

test('OP-21 · chủ sân từ chối MỘT lần → đóng cả các giao dịch trùng, khách chỉ nhận một thông báo, đơn không thể "xác nhận lại"', async () => {
    seed();
    ownerPayment({ _id: 'p-a', orderRef: 'A', status: 'pending' });
    ownerPayment({ _id: 'p-b', orderRef: 'B', status: 'awaiting_confirmation' });
    const r = await call(paymentController.ownerRejectBankTransfer, { params: { id: 'p-b' }, body: { reason: 'Không thấy tiền' }, user: asUser('ownerA') });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.ok(state.payments.every((p) => p.status === 'failed'), 'Mọi giao dịch của đơn phải bị đóng');
    assert.strictEqual(state.notifications.filter((n) => n.userId === 'cust1').length, 1);
    // Trường hợp bạn gặp: từ chối dòng 1 rồi xác nhận dòng 2 → đơn vẫn thành công. Giờ dòng 2 không còn xác nhận được.
    const again = await call(paymentController.ownerConfirmBankTransfer, { params: { id: 'p-a' }, user: asUser('ownerA') });
    assert.strictEqual(again.statusCode, 409);
    assert.strictEqual(state.bookings[0].status, 'awaiting_payment');
});

test('OP-22 · đơn đã huỷ/hết hạn → chủ sân KHÔNG xác nhận được (409), giao dịch giữ nguyên để từ chối/hoàn tiền', async () => {
    seed();
    state.bookings[0].status = 'cancelled';
    const p = ownerPayment();
    const r = await call(paymentController.ownerConfirmBankTransfer, { params: { id: 'payOwner' }, user: asUser('ownerA') });
    assert.strictEqual(r.statusCode, 409);
    assert.strictEqual(p.status, 'awaiting_confirmation');
});

test('OP-23 · khách đã báo chuyển khoản thì KHÔNG huỷ đơn được (409)', async () => {
    seed();
    ownerPayment();
    const r = await call(bookingController.cancelBooking, { params: { id: 'book1' }, body: {}, user: asUser('cust1') });
    assert.strictEqual(r.statusCode, 409, JSON.stringify(r.body));
    assert.strictEqual(state.bookings[0].status, 'awaiting_payment');
});

test('OP-24 · khách huỷ đơn chưa báo chuyển → đơn huỷ và giao dịch treo bị đóng (chủ sân hết thấy)', async () => {
    seed();
    const p = ownerPayment({ status: 'pending' });
    const r = await call(bookingController.cancelBooking, { params: { id: 'book1' }, body: { reason: 'Đổi ý' }, user: asUser('cust1') });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(state.bookings[0].status, 'cancelled');
    assert.strictEqual(p.status, 'failed');
});

test('OP-25 · tác vụ nền huỷ đơn quá hạn: đóng giao dịch pending, nhưng KHÔNG đụng đơn khách đã báo chuyển', async () => {
    seed();
    const old = new Date(Date.now() - 3 * 3600 * 1000);
    state.bookings[0].createdAt = old;
    const stale = ownerPayment({ _id: 'p-stale', orderRef: 'S', status: 'pending' });
    state.bookings.push(makeDoc({
        _id: 'book2', customerId: 'cust1', venueId: 'venueA', status: 'awaiting_payment', createdAt: old,
        amount: 100000, creditApplied: 0, pointsUsed: 0,
    }));
    const reported = ownerPayment({ _id: 'p-rep', bookingId: 'book2', orderRef: 'R', status: 'awaiting_confirmation', receiver: { ownerId: 'ownerA' } });

    const n = await jobs.expireStaleBookings();
    assert.strictEqual(n, 1);
    assert.strictEqual(state.bookings[0].status, 'cancelled');
    assert.strictEqual(stale.status, 'failed', 'Giao dịch pending của đơn hết hạn phải bị đóng');
    assert.strictEqual(state.bookings[1].status, 'awaiting_payment', 'Đơn khách đã báo chuyển không được tự huỷ');
    assert.strictEqual(reported.status, 'awaiting_confirmation');
});

(async () => {
    console.log('\n=== CHUYỂN KHOẢN ĐẶT SÂN: TIỀN VÀO CHỦ SÂN, CHỦ SÂN XÁC NHẬN ===\n');
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (err) { console.log(`  ✗ ${name}\n    ${err.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
