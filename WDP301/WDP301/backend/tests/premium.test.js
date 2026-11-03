/**
 * KIỂM THỬ GÓI PREMIUM — mua gói, xác nhận (admin / webhook ngân hàng), gia hạn, nhắc hạn, quyền lợi.
 * Không cần MongoDB: model được thay bằng bản giả trong bộ nhớ (xem ownerPaymentFlow.test.js).
 */
const assert = require('assert');
const path = require('path');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

const resolve = (rel) => require.resolve(path.join(__dirname, '..', rel));
function fake(rel, exports) {
    const filename = resolve(rel);
    require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
function q(value) {
    const p = Promise.resolve(value);
    p.select = () => q(value); p.sort = () => q(value); p.limit = () => q(value); p.skip = () => q(value);
    return p;
}
const DAY = 86400000;
const state = {};
function reset() {
    Object.assign(state, {
        orders: [], users: [], notifications: [], seq: 0,
        settings: { premiumEnabled: true, premiumVenuePrice: 149000, premiumPlayerPrice: 29000, premiumDurationDays: 30, premiumVenueCommissionRate: 7, premiumPlayerHoldMinutes: 20, commissionRate: 10, bankBin: '970416', bankAccountNumber: '2110999999', bankAccountName: 'ESPORT360', bankName: 'ACB' },
    });
    state.users.push(
        { _id: 'owner1', role: 'owner', name: 'Chu San', email: 'cs@gmail.com', premium: {} },
        { _id: 'cust1', role: 'customer', name: 'Khach', email: 'k@gmail.com', premium: {} },
        { _id: 'admin1', role: 'admin', name: 'Admin' },
    );
}
const getPath = (o, k) => k.split('.').reduce((a, b) => (a == null ? a : a[b]), o);
function matches(doc, f = {}) {
    return Object.entries(f).every(([k, c]) => {
        const v = getPath(doc, k);
        if (c && typeof c === 'object' && !(c instanceof Date)) {
            if ('$in' in c) return c.$in.map(String).includes(String(v));
            if ('$ne' in c) return Array.isArray(v) ? !v.includes(c.$ne) : String(v) !== String(c.$ne);
            if ('$gt' in c || '$lte' in c) return (c.$gt === undefined || v > c.$gt) && (c.$lte === undefined || v <= c.$lte);
            return true;
        }
        if (c === null) return v == null;
        return String(v) === String(c);
    });
}
const mk = (d) => Object.assign(d, { save: async function () { return this; }, toObject() { const { save, toObject, ...r } = this; return { ...r }; } });
fake('models/PremiumOrder.js', {
    create: async (d) => {
        if (state.orders.some((o) => o.code === d.code)) { const e = new Error('dup'); e.code = 11000; throw e; }
        const o = mk({ _id: 'o' + (++state.seq), status: 'pending', receivedAmount: 0, bankTxnIds: [], remindedAt: null, expiredNotifiedAt: null, ...d }); state.orders.push(o); return o;
    },
    findOne: (f) => q(state.orders.find((o) => matches(o, f)) || null),
    find: (f) => q(state.orders.filter((o) => matches(o, f))),
    findById: (id) => q(state.orders.find((o) => o._id === id) || null),
    countDocuments: (f) => Promise.resolve(state.orders.filter((o) => matches(o, f)).length),
    findOneAndUpdate: async (f, u) => {
        const o = state.orders.find((x) => matches(x, f)); if (!o) return null;
        Object.assign(o, u.$set || {});
        Object.entries(u.$inc || {}).forEach(([k, v]) => { o[k] = (o[k] || 0) + v; });
        Object.entries(u.$push || {}).forEach(([k, v]) => { o[k] = [...(o[k] || []), v]; });
        return o;
    },
});
fake('models/User.js', {
    findById: (id) => q(state.users.find((u) => u._id === id) || null),
    find: (f) => q(state.users.filter((u) => !f?.role || u.role === f.role)),
    updateOne: async (f, u) => {
        const x = state.users.find((y) => matches(y, f));
        Object.entries(u.$set || {}).forEach(([k, v]) => {
            const [a, b] = k.split('.'); if (b) { x[a] = x[a] || {}; x[a][b] = v; } else x[a] = v;
        });
    },
});
fake('models/Notification.js', { create: async (n) => { state.notifications.push(n); return n; } });
fake('utils/platformSettings.js', { getSettings: async () => state.settings });

const svc = require('../services/premiumService');
const premium = require('../utils/premium');
const U = (id) => state.users.find((u) => u._id === id);
const fails = async (fn, status) => { try { await fn(); } catch (e) { assert.strictEqual(e.status, status, e.message); return; } assert.fail('phải lỗi ' + status); };

test('PR-01 · chủ sân mua → gói Venue Premium 149.000đ, người chơi → Premium Player 29.000đ, mã PRM… có QR', async () => {
    reset();
    const a = await svc.createOrder(U('owner1'));
    assert.strictEqual(a.order.plan, 'venue_premium'); assert.strictEqual(a.order.amount, 149000);
    assert.ok(/^PRM\d{6}[A-Z0-9]{5}$/.test(a.order.code), a.order.code);
    const info = await svc.payInfoOf(a.order);
    assert.ok(info.qrUrl.includes('970416-2110999999') && info.qrUrl.includes(a.order.code));
    const b = await svc.createOrder(U('cust1'));
    assert.strictEqual(b.order.plan, 'player_premium'); assert.strictEqual(b.order.amount, 29000);
});
test('PR-02 · còn đơn đang mở thì dùng lại (không tạo trùng); admin không mua được; chưa có tài khoản nhận tiền → 409; tắt bán → 409', async () => {
    reset();
    const a = await svc.createOrder(U('cust1')); const b = await svc.createOrder(U('cust1'));
    assert.strictEqual(b.reused, true); assert.strictEqual(a.order._id, b.order._id); assert.strictEqual(state.orders.length, 1);
    await fails(() => svc.createOrder(U('admin1')), 403);
    state.settings.bankBin = ''; await fails(() => svc.createOrder(U('owner1')), 409);
    state.settings.bankBin = '970416'; state.settings.premiumEnabled = false; await fails(() => svc.createOrder(U('owner1')), 409);
});
test('PR-03 · báo đã chuyển → reported + admin được báo; người khác không báo thay được', async () => {
    reset();
    const { order } = await svc.createOrder(U('cust1'));
    await fails(() => svc.reportPaid(order._id, U('owner1')), 404);
    const r = await svc.reportPaid(order._id, U('cust1'));
    assert.strictEqual(r.status, 'reported');
    assert.ok(state.notifications.some((n) => n.userId === 'admin1' && /Premium/.test(n.title)));
});
test('PR-04 · admin xác nhận → paid, gói có hiệu lực đúng 30 ngày, người dùng được báo', async () => {
    reset();
    const { order } = await svc.createOrder(U('cust1'));
    const t0 = Date.now();
    const paid = await svc.confirmOrder(order._id, 'admin1');
    assert.strictEqual(paid.status, 'paid'); assert.strictEqual(paid.autoConfirmed, false);
    assert.ok(premium.hasPlan(U('cust1'), 'player_premium'));
    const left = new Date(U('cust1').premium.until).getTime() - t0;
    assert.ok(Math.abs(left - 30 * DAY) < 5000, `còn ${left / DAY} ngày`);
    assert.ok(state.notifications.some((n) => n.userId === 'cust1' && /kích hoạt/.test(n.title)));
});
test('PR-05 · bấm xác nhận lần hai → 409, thời hạn không bị cộng thêm', async () => {
    reset();
    const { order } = await svc.createOrder(U('cust1'));
    await svc.confirmOrder(order._id, 'admin1');
    const until = U('cust1').premium.until;
    await fails(() => svc.confirmOrder(order._id, 'admin1'), 409);
    assert.strictEqual(U('cust1').premium.until, until);
});
test('PR-06 · gia hạn khi còn hạn → cộng NỐI TIẾP từ ngày hết hạn cũ (không mất ngày đã trả)', async () => {
    reset();
    const a = await svc.createOrder(U('cust1')); await svc.confirmOrder(a.order._id, 'admin1');
    const first = new Date(U('cust1').premium.until).getTime();
    const b = await svc.createOrder(U('cust1')); assert.strictEqual(b.reused, false);
    await svc.confirmOrder(b.order._id, 'admin1');
    assert.strictEqual(new Date(U('cust1').premium.until).getTime(), first + 30 * DAY);
});
test('PR-07 · gói đã hết hạn rồi mua lại → tính từ bây giờ, không nối vào quá khứ', async () => {
    reset();
    U('cust1').premium = { plan: 'player_premium', since: new Date(Date.now() - 60 * DAY), until: new Date(Date.now() - 10 * DAY) };
    assert.strictEqual(premium.isActive(U('cust1')), false);
    const { order } = await svc.createOrder(U('cust1')); const t0 = Date.now();
    await svc.confirmOrder(order._id, 'admin1');
    assert.ok(Math.abs(new Date(U('cust1').premium.until).getTime() - (t0 + 30 * DAY)) < 5000);
});
test('PR-08 · webhook: đúng mã + đủ tiền → tự xác nhận; bắn lại cùng giao dịch → duplicate', async () => {
    reset();
    const { order } = await svc.createOrder(U('owner1'));
    const tx = { txnId: 'T1', amount: 149000, content: `CK ${order.code} goi premium`, accountNumber: '2110999999' };
    const r = await svc.autoConfirmFromBank(tx);
    assert.strictEqual(r.status, 'confirmed'); assert.strictEqual(r.order.autoConfirmed, true);
    assert.ok(premium.hasPlan(U('owner1'), 'venue_premium'));
    assert.strictEqual((await svc.autoConfirmFromBank(tx)).status, 'no_match'); // đơn đã paid → không còn đơn mở
});
test('PR-09 · webhook: tiền về làm hai lần → cộng dồn rồi mới xác nhận; một giao dịch không tính hai lần', async () => {
    reset();
    const { order } = await svc.createOrder(U('owner1'));
    const base = { content: order.code, accountNumber: '2110999999' };
    assert.strictEqual((await svc.autoConfirmFromBank({ ...base, txnId: 'A', amount: 100000 })).status, 'partial');
    assert.strictEqual((await svc.autoConfirmFromBank({ ...base, txnId: 'A', amount: 100000 })).status, 'duplicate');
    assert.strictEqual(premium.isActive(U('owner1')), false);
    assert.strictEqual((await svc.autoConfirmFromBank({ ...base, txnId: 'B', amount: 49000 })).status, 'confirmed');
    assert.ok(premium.isActive(U('owner1')));
});
test('PR-10 · webhook: nội dung không có mã / tiền ra / sai số tài khoản → không xác nhận', async () => {
    reset();
    const { order } = await svc.createOrder(U('owner1'));
    assert.strictEqual((await svc.autoConfirmFromBank({ txnId: '1', amount: 149000, content: 'chuyen tien' })).status, 'no_match');
    assert.strictEqual((await svc.autoConfirmFromBank({ txnId: '2', amount: 149000, content: order.code, direction: 'out' })).status, 'ignored');
    assert.strictEqual((await svc.autoConfirmFromBank({ txnId: '3', amount: 149000, content: order.code, accountNumber: '999' })).status, 'no_match');
    assert.strictEqual(state.orders[0].status, 'pending');
});
test('PR-11 · admin từ chối → rejected, người mua được báo lý do; đơn đã paid không từ chối được', async () => {
    reset();
    const { order } = await svc.createOrder(U('cust1'));
    const r = await svc.rejectOrder(order._id, 'admin1', 'Không thấy tiền');
    assert.strictEqual(r.status, 'rejected');
    assert.ok(state.notifications.some((n) => n.userId === 'cust1' && /Không thấy tiền/.test(n.message)));
    const b = await svc.createOrder(U('cust1')); await svc.confirmOrder(b.order._id, 'admin1');
    await fails(() => svc.rejectOrder(b.order._id, 'admin1', 'x'), 409);
});
test('PR-12 · huỷ đơn: chỉ huỷ được đơn chưa báo chuyển', async () => {
    reset();
    const { order } = await svc.createOrder(U('cust1'));
    await svc.reportPaid(order._id, U('cust1'));
    await fails(() => svc.cancelOrder(order._id, U('cust1')), 409);
});
test('PR-13 · nhắc hạn: còn ≤ 3 ngày nhắc đúng MỘT lần; hết hạn báo MỘT lần; đã gia hạn thì không nhắc', async () => {
    reset();
    const { order } = await svc.createOrder(U('cust1')); await svc.confirmOrder(order._id, 'admin1');
    const soon = new Date(Date.now() + 2 * DAY);
    state.orders[0].endsAt = soon; U('cust1').premium.until = soon;
    assert.strictEqual(await svc.sendExpiryReminders(), 1);
    assert.strictEqual(await svc.sendExpiryReminders(), 0);
    assert.strictEqual(await svc.sendExpiryReminders(new Date(Date.now() + 3 * DAY)), 1); // hết hạn
    assert.strictEqual(await svc.sendExpiryReminders(new Date(Date.now() + 4 * DAY)), 0);
    // đã gia hạn → không nhắc
    reset(); const a = await svc.createOrder(U('cust1')); await svc.confirmOrder(a.order._id, 'admin1');
    state.orders[0].endsAt = new Date(Date.now() + 2 * DAY); // nhưng user.premium.until còn xa (đã gia hạn)
    assert.strictEqual(await svc.sendExpiryReminders(), 0);
});
test('PR-14 · thống kê: tổng doanh thu, theo gói, gói còn hiệu lực', async () => {
    reset();
    const a = await svc.createOrder(U('owner1')); await svc.confirmOrder(a.order._id, 'admin1');
    const b = await svc.createOrder(U('cust1')); await svc.confirmOrder(b.order._id, 'admin1');
    const s = await svc.stats();
    assert.strictEqual(s.revenue, 178000); assert.strictEqual(s.byPlan.venue_premium.revenue, 149000);
    assert.strictEqual(s.active.venue_premium, 1); assert.strictEqual(s.active.player_premium, 1);
});

// ---- Quyền lợi
test('PR-15 · phí dịch vụ: chủ sân Premium chỉ chịu 7% thay vì 10%; không Premium thì giữ nguyên', () => {
    const on = { premium: { plan: 'venue_premium', until: new Date(Date.now() + DAY) } };
    const a = premium.priceFee({ amount: 200000, ratePct: 10, customerSharePct: 0, owner: on, customer: {}, settings: state.settings });
    assert.strictEqual(a.fee.total, 14000); assert.strictEqual(a.fee.ownerCommission, 14000); assert.strictEqual(a.ratePct, 7);
    const b = premium.priceFee({ amount: 200000, ratePct: 10, customerSharePct: 0, owner: { premium: {} }, customer: {}, settings: state.settings });
    assert.strictEqual(b.fee.total, 20000);
});
test('PR-16 · ưu đãi không làm tăng phí: nếu mức chung đã thấp hơn 7% thì giữ mức chung', () => {
    const on = { premium: { plan: 'venue_premium', until: new Date(Date.now() + DAY) } };
    const a = premium.priceFee({ amount: 200000, ratePct: 5, owner: on, customer: {}, settings: state.settings });
    assert.strictEqual(a.ratePct, 5);
});
test('PR-17 · người chơi Premium: miễn phí dịch vụ cộng thêm, phần chủ sân chịu KHÔNG đổi', () => {
    const me = { premium: { plan: 'player_premium', until: new Date(Date.now() + DAY) } };
    const a = premium.priceFee({ amount: 200000, ratePct: 10, customerSharePct: 50, owner: {}, customer: me, settings: state.settings });
    assert.strictEqual(a.fee.serviceFee, 10000); assert.strictEqual(a.serviceFee, 0); assert.strictEqual(a.fee.ownerCommission, 10000);
    assert.strictEqual(a.serviceFeeWaived, true);
    const b = premium.priceFee({ amount: 200000, ratePct: 10, customerSharePct: 50, owner: {}, customer: {}, settings: state.settings });
    assert.strictEqual(b.serviceFee, 10000);
});
test('PR-18 · gói sai vai trò không có tác dụng: chủ sân có Premium Player / người chơi có Venue Premium → không được ưu đãi', () => {
    const wrongCust = { premium: { plan: 'venue_premium', until: new Date(Date.now() + DAY) } };
    const wrongOwner = { premium: { plan: 'player_premium', until: new Date(Date.now() + DAY) } };
    const a = premium.priceFee({ amount: 200000, ratePct: 10, customerSharePct: 50, owner: wrongOwner, customer: wrongCust, settings: state.settings });
    assert.strictEqual(a.ratePct, 10); assert.strictEqual(a.serviceFee, 10000);
});
test('PR-19 · gói hết hạn không còn quyền lợi', () => {
    const old = { premium: { plan: 'player_premium', until: new Date(Date.now() - 1000) } };
    assert.strictEqual(premium.hasPlan(old, 'player_premium'), false); assert.strictEqual(premium.daysLeft(old), 0);
});
test('PR-20 · danh mục gói lấy giá/ưu đãi từ Cài đặt', () => {
    const c = premium.catalog({ ...state.settings, premiumVenuePrice: 199000, premiumVenueCommissionRate: 6, premiumPlayerHoldMinutes: 25 });
    assert.strictEqual(c.plans[0].price, 199000); assert.ok(c.plans[0].perks.some((p) => /6%/.test(p.title)));
    assert.ok(c.plans[1].perks.some((p) => /25 phút/.test(p.title)));
});

(async () => {
    console.log('\n=== GÓI PREMIUM ===\n');
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; } catch (err) { console.log(`  ✗ ${name}\n    ${err.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
