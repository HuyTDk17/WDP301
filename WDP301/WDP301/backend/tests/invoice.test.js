/**
 * KIỂM THỬ HÓA ĐƠN: số tiền đúng, chỉ chủ đơn xem được, chỉ đơn đã xác nhận/hoàn tất mới có hóa đơn,
 * và KHÔNG lộ dữ liệu nội bộ (hoa hồng chủ sân, mã giao dịch cổng...).
 * Model thay bằng bản giả trong bộ nhớ, không cần MongoDB.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
const resolve = (rel) => require.resolve(path.join(__dirname, '..', rel));
function fake(rel, exports) { const f = resolve(rel); require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] }; }
const oid = (n) => Number(n).toString(16).padStart(24, '0');
const q = (v) => { const p = Promise.resolve(v); p.select = () => q(v); p.sort = () => q(v); return p; };

const state = {};
function reset() { Object.assign(state, { bookings: [], venues: [], users: [], payments: [] }); }
fake('models/Booking.js', { findById: async (id) => state.bookings.find((b) => b._id === id) || null });
fake('models/Venue.js', { findById: async (id) => state.venues.find((v) => v._id === id) || null });
fake('models/User.js', { findById: (id) => q(state.users.find((u) => u._id === id) || null) });
fake('models/Payment.js', { findOne: (f) => q(state.payments.find((p) => String(p.bookingId) === String(f.bookingId) && p.status === f.status && p.purpose === f.purpose) || null) });
fake('utils/platformSettings.js', { getSettings: async () => ({ platformName: 'ESport360', supportEmail: 'support@esport360.vn' }) });

const { buildInvoice, invoiceNumber } = require('../utils/invoice');
const ctrl = require('../controllers/invoiceController');
const call = (handler, req) => new Promise((ok, bad) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; ok(this); return this; } };
    handler(req, res, (e) => bad(e));
});

const ME = { _id: oid(1), name: 'Nguyễn Văn A', email: 'a@x.vn', phone: '0900000001' };
const OTHER = { _id: oid(2), name: 'Khách B' };
function seed(over = {}) {
    reset();
    state.venues.push({ _id: oid(10), name: 'Sân Mỹ Đình', ownerId: oid(5), address: { street: '1 Lê Đức Thọ', district: 'Nam Từ Liêm', city: 'Hà Nội' } });
    state.users.push({ _id: oid(5), name: 'Chủ sân Lan' });
    state.bookings.push({
        _id: oid(20), customerId: ME._id, venueId: oid(10), venueName: 'Sân Mỹ Đình', courtName: 'Sân 1', sport: 'Bóng đá',
        date: '2026-10-20', startTime: '18:00', endTime: '20:00', duration: 2, status: 'completed',
        amount: 400000, serviceFee: 20000, discountAmount: 50000, creditApplied: 30000, paymentMethod: 'bank_transfer',
        createdAt: '2026-10-01T17:30:00.000Z', updatedAt: '2026-10-02T03:00:00.000Z',
        // trường nội bộ — KHÔNG được xuất hiện trong hóa đơn
        ownerCommission: 20000, commissionRate: 5, ...over,
    });
    state.payments.push({ bookingId: oid(20), purpose: 'booking', status: 'completed', method: 'bank_transfer', orderRef: 'ES360ABC123', updatedAt: '2026-10-01T18:00:00.000Z', gatewayResponse: { secret: 'x' }, transactionRef: 'BANK-REF-SECRET' });
}

console.log('\n=== HÓA ĐƠN ===\n');
test('INV-01 · số tiền: tiền sân + phí dịch vụ − giảm giá = tổng; chỉ hiện dòng có giá trị', async () => {
    seed();
    const r = await call(ctrl.getInvoice, { user: ME, params: { id: oid(20) } });
    assert.strictEqual(r.code, 200);
    const inv = r.body.invoice;
    assert.deepStrictEqual(inv.lines, [{ label: 'Tiền thuê sân', amount: 400000 }, { label: 'Phí dịch vụ', amount: 20000 }, { label: 'Giảm giá', amount: -50000 }]);
    assert.strictEqual(inv.total, 370000);
    assert.strictEqual(inv.payment.creditApplied, 30000);
    assert.strictEqual(inv.payment.cashPaid, 340000);
    assert.strictEqual(inv.payment.methodLabel, 'Chuyển khoản ngân hàng');
});
test('INV-02 · không có phí dịch vụ/giảm giá thì chỉ còn một dòng tiền sân', async () => {
    seed({ serviceFee: 0, discountAmount: 0, creditApplied: 0 });
    const inv = (await call(ctrl.getInvoice, { user: ME, params: { id: oid(20) } })).body.invoice;
    assert.deepStrictEqual(inv.lines, [{ label: 'Tiền thuê sân', amount: 400000 }]);
    assert.strictEqual(inv.total, 400000);
    assert.strictEqual(inv.payment.cashPaid, 400000);
});
test('INV-03 · chỉ chủ đơn xem được (403 với khách khác, kể cả biết mã đơn)', async () => {
    seed();
    assert.strictEqual((await call(ctrl.getInvoice, { user: OTHER, params: { id: oid(20) } })).code, 403);
});
test('INV-04 · không tồn tại → 404; chưa thanh toán/đã huỷ/đã chuyển → 422', async () => {
    seed();
    assert.strictEqual((await call(ctrl.getInvoice, { user: ME, params: { id: oid(999) } })).code, 404);
    for (const status of ['awaiting_payment', 'pending', 'cancelled', 'no_show', 'transferred']) {
        seed({ status });
        assert.strictEqual((await call(ctrl.getInvoice, { user: ME, params: { id: oid(20) } })).code, 422, status);
    }
    seed({ status: 'confirmed' });
    assert.strictEqual((await call(ctrl.getInvoice, { user: ME, params: { id: oid(20) } })).code, 200);
});
test('INV-05 · KHÔNG lộ dữ liệu nội bộ (hoa hồng chủ sân, tỉ lệ, phản hồi cổng thanh toán, mã giao dịch ngân hàng)', async () => {
    seed();
    const json = JSON.stringify((await call(ctrl.getInvoice, { user: ME, params: { id: oid(20) } })).body);
    for (const leak of ['ownerCommission', 'commissionRate', 'gatewayResponse', 'BANK-REF-SECRET', 'secret', 'customerId', 'ownerId']) {
        assert.ok(!json.includes(leak), `lộ: ${leak}`);
    }
});
test('INV-06 · thông tin hiển thị: khách, địa điểm + địa chỉ, tên chủ sân, ngày giờ, mã giao dịch của khách', async () => {
    seed();
    const inv = (await call(ctrl.getInvoice, { user: ME, params: { id: oid(20) } })).body.invoice;
    assert.deepStrictEqual(inv.customer, { name: 'Nguyễn Văn A', email: 'a@x.vn', phone: '0900000001' });
    assert.strictEqual(inv.seller.address, '1 Lê Đức Thọ, Nam Từ Liêm, Hà Nội');
    assert.strictEqual(inv.seller.ownerName, 'Chủ sân Lan');
    assert.strictEqual(inv.service.startTime, '18:00');
    assert.strictEqual(inv.payment.reference, 'ES360ABC123');
});
test('INV-07 · số hóa đơn ổn định theo lượt đặt, ngày tính theo giờ Việt Nam (17:30 UTC ngày 01 đã là ngày 02)', async () => {
    seed();
    const b = state.bookings[0];
    assert.strictEqual(invoiceNumber(b), 'ES360-20261002-000014'.replace('000014', String(b._id).slice(-6).toUpperCase()));
    assert.strictEqual(invoiceNumber(b), invoiceNumber({ ...b }));
});
test('INV-08 · thanh toán toàn bộ bằng số dư khuyến mãi: tiền thật = 0, nhãn đúng', async () => {
    const inv = buildInvoice({ booking: { _id: oid(1), amount: 100000, serviceFee: 0, discountAmount: 0, creditApplied: 100000, paymentMethod: 'credit' }, payment: { method: 'credit' }, customer: ME });
    assert.strictEqual(inv.payment.cashPaid, 0);
    assert.strictEqual(inv.payment.methodLabel, 'Số dư khuyến mãi');
});
test('INV-09 · route /bookings/:id/invoice nằm sau authorize(customer) và trang hóa đơn đã có route', async () => {
    const root = path.join(__dirname, '..');
    const r = fs.readFileSync(path.join(root, 'routes', 'bookingRoutes.js'), 'utf8');
    assert.ok(r.indexOf("authorize('customer')") < r.indexOf("'/:id/invoice'"));
    assert.ok(fs.readFileSync(path.join(root, '..', 'e360sport', 'src', 'routes', 'AppRoutes.jsx'), 'utf8').includes('/bookings/:bookingId/invoice'));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
