/**
 * KIỂM THỬ — HẠN MỨC ĐỔI LỊCH THEO THÁNG + quyền lợi chủ sân với đơn cũ có chia phí.
 * Chuyển sân (T3/T4/T5) đã bị gỡ; các trường chia phí trên đơn cũ vẫn được quyết toán đúng.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
const resolve = (rel) => require.resolve(path.join(__dirname, '..', rel));
function fake(rel, exports) { const f = resolve(rel); require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] }; }
const oid = (n) => Number(n).toString(16).padStart(24, '0');

// TransferRequest giả: chỉ cần countDocuments với $in và $gte
const TR = { docs: [], queries: 0 };
TR.countDocuments = async (f) => {
    TR.queries += 1;
    return TR.docs.filter((d) => String(d.customerId) === String(f.customerId) && d.status === f.status && f.type.$in.includes(d.type) && d.completedAt >= f.completedAt.$gte).length;
};
fake('models/TransferRequest.js', TR);
const { monthStartVN, monthlyStatus } = require('../utils/transferLimits');
const { entitlementOfBooking } = require('../utils/settlementMath');

console.log('\n=== HẠN MỨC ĐỔI LỊCH THEO THÁNG ===\n');
test('LS-02 · mốc đầu tháng theo giờ Việt Nam: 00:30 ngày 1/11 (VN) đã là tháng 11; 23:59 ngày 31/10 (VN) vẫn là tháng 10', async () => {
    assert.strictEqual(monthStartVN(new Date('2026-10-31T17:30:00Z')).toISOString(), '2026-10-31T17:00:00.000Z');
    assert.strictEqual(monthStartVN(new Date('2026-10-31T16:59:00Z')).toISOString(), '2026-09-30T17:00:00.000Z');
    assert.strictEqual(monthStartVN(new Date('2026-01-15T05:00:00Z')).toISOString(), '2025-12-31T17:00:00.000Z');
});
test('LS-03 · hạn mức tháng: 0 = không giới hạn và KHÔNG truy vấn CSDL; chỉ đếm lượt đổi lịch đã hoàn tất, đúng khách, đúng tháng', async () => {
    const settings0 = { maxTransfersPerMonth: 0 };
    TR.queries = 0;
    assert.deepStrictEqual(await monthlyStatus(oid(1), settings0), { limit: 0, used: 0, reached: false });
    assert.deepStrictEqual(await monthlyStatus(oid(1), {}), { limit: 0, used: 0, reached: false });
    assert.strictEqual(TR.queries, 0);
    const now = new Date('2026-10-20T10:00:00Z');
    const mk = (over) => ({ customerId: oid(1), status: 'completed', type: 'T2', completedAt: new Date('2026-10-05T10:00:00Z'), ...over });
    TR.docs = [
        mk({}), mk({ type: 'T1' }),
        mk({ type: 'T9' }),                                         // loại không phải đổi lịch: không tính
        mk({ status: 'expired' }), mk({ status: 'aborted' }),       // không hoàn tất: không tính
        mk({ completedAt: new Date('2026-09-28T10:00:00Z') }),      // tháng trước: không tính
        mk({ customerId: oid(2) }),                                 // khách khác: không tính
    ];
    assert.deepStrictEqual(await monthlyStatus(oid(1), { maxTransfersPerMonth: 3 }, now), { limit: 3, used: 2, reached: false });
    assert.deepStrictEqual(await monthlyStatus(oid(1), { maxTransfersPerMonth: 2 }, now), { limit: 2, used: 2, reached: true });
    assert.strictEqual((await monthlyStatus(oid(3), { maxTransfersPerMonth: 1 }, now)).reached, false);
});
// ── quyết toán ──
const base = { paymentMethod: 'bank_transfer', amount: 200000, ownerCommission: 20000, serviceFee: 0 };
test('LS-04 · quyền lợi chủ sân: mặc định (không có trường chia phí) giữ NGUYÊN công thức cũ', async () => {
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'confirmed', transferFeeAmount: 10000 }), 180000 + 10000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'transferred', compensationAmount: 40000 }), 40000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'cancelled', refundAmount: 100000, transferFeeAmount: 10000 }), 100000 - 10000 + 10000);
});
test('LS-05 · đơn CŨ có chia phí: đơn mới trừ phần chia, đơn gốc (đã chuyển đi) cộng đúng phần đó; đơn mới bị hủy sau đó vẫn trừ phần chia', async () => {
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'confirmed', transferFeeAmount: 10000, transferFeeShareOut: 3000 }), 180000 + 10000 - 3000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'completed', transferFeeAmount: 10000, transferFeeShareOut: 3000 }), 187000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'transferred', compensationAmount: 40000, transferFeeShareIn: 3000 }), 43000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'cancelled', refundAmount: 100000, transferFeeAmount: 10000, transferFeeShareOut: 3000 }), 100000 - 10000 + 10000 - 3000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'manual-ignored', paymentMethod: 'manual', transferFeeShareIn: 5 }), 0);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'awaiting_payment', transferFeeShareOut: 3000 }), 0);
});
test('LS-07 · đã gắn đủ: hạn mức kiểm tra TRƯỚC khi giữ chỗ; không còn chia phí khi đổi lịch; quyết toán vẫn đọc đủ trường cho đơn cũ; eligibility trả `monthly`; cài đặt & model có trường', async () => {
    const root = path.join(__dirname, '..');
    const ts = fs.readFileSync(path.join(root, 'services', 'transferService.js'), 'utf8');
    assert.ok(ts.indexOf('monthlyStatus(booking.customerId, settings)') > 0 && ts.indexOf('monthlyStatus(') < ts.indexOf('Hold.create'), 'kiểm tra hạn mức trước khi giữ chỗ');
    assert.ok(!ts.includes('feeShare') && !ts.includes('transferSplit'), 'đổi lịch không còn chia phí');
    assert.ok(fs.readFileSync(path.join(root, 'services', 'settlementService.js'), 'utf8').includes('transferFeeShareIn transferFeeShareOut'));
    assert.ok(/monthly,/.test(fs.readFileSync(path.join(root, 'controllers', 'transferController.js'), 'utf8')));
    const st = fs.readFileSync(path.join(root, 'controllers', 'settingsController.js'), 'utf8');
    assert.ok(st.includes('maxTransfersPerMonth: { min: 0, max: 100 }') && !st.includes('transferFeeOriginSharePct'));
    const ps = fs.readFileSync(path.join(root, 'models', 'PlatformSetting.js'), 'utf8');
    assert.ok(/maxTransfersPerMonth: \{ type: Number, default: 0/.test(ps) && !ps.includes('transferFeeOriginSharePct'));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
