/**
 * KIỂM THỬ #61 — CHÍNH SÁCH CHUNG CỦA MẠNG LƯỚI CHUYỂN SÂN: hạn mức theo tháng + chia phí cho chủ sân gốc.
 * Phần tiền là chỗ dễ sai nhất nên khoá chặt: mặc định (0) không đổi gì, chia phí chỉ T4, tổng quyền lợi các chủ sân
 * KHÔNG đổi sau khi chia (chỉ chuyển giữa hai chủ sân), phần chia không âm và không vượt phí.
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

// TransferRequest giả: chỉ cần countDocuments với $ne và $gte
const TR = { docs: [], queries: 0 };
TR.countDocuments = async (f) => {
    TR.queries += 1;
    return TR.docs.filter((d) => String(d.customerId) === String(f.customerId) && d.status === f.status && d.type !== f.type.$ne && d.completedAt >= f.completedAt.$gte).length;
};
fake('models/TransferRequest.js', TR);
const { originFeeShare } = require('../utils/transferSplit');
const { monthStartVN, monthlyStatus } = require('../utils/transferLimits');
const { entitlementOfBooking } = require('../utils/settlementMath');

console.log('\n=== HẠN MỨC THÁNG & CHIA PHÍ CHUYỂN SÂN (#61) ===\n');
test('LS-01 · chia phí: chỉ T4, làm tròn xuống, không âm, không vượt phí, % ngoài khoảng bị kẹp', async () => {
    assert.strictEqual(originFeeShare({ type: 'T4', transferFee: 10000, pct: 30 }), 3000);
    assert.strictEqual(originFeeShare({ type: 'T4', transferFee: 9999, pct: 33 }), 3299, 'làm tròn xuống');
    assert.strictEqual(originFeeShare({ type: 'T4', transferFee: 10000, pct: 0 }), 0);
    assert.strictEqual(originFeeShare({ type: 'T4', transferFee: 10000, pct: 100 }), 10000);
    assert.strictEqual(originFeeShare({ type: 'T4', transferFee: 10000, pct: 250 }), 10000, 'kẹp 100%');
    assert.strictEqual(originFeeShare({ type: 'T4', transferFee: 10000, pct: -20 }), 0, 'kẹp 0%');
    assert.strictEqual(originFeeShare({ type: 'T4', transferFee: -500, pct: 50 }), 0);
    assert.strictEqual(originFeeShare({ type: 'T4', transferFee: 'abc', pct: 'xyz' }), 0);
    for (const type of ['T1', 'T2', 'T3', 'T5']) assert.strictEqual(originFeeShare({ type, transferFee: 10000, pct: 50 }), 0, type);
    for (let fee = 0; fee <= 200000; fee += 7777) for (const pct of [0, 1, 33, 50, 99, 100]) {
        const s = originFeeShare({ type: 'T4', transferFee: fee, pct });
        assert.ok(Number.isInteger(s) && s >= 0 && s <= fee, `fee ${fee} pct ${pct}`);
    }
});
test('LS-02 · mốc đầu tháng theo giờ Việt Nam: 00:30 ngày 1/11 (VN) đã là tháng 11; 23:59 ngày 31/10 (VN) vẫn là tháng 10', async () => {
    assert.strictEqual(monthStartVN(new Date('2026-10-31T17:30:00Z')).toISOString(), '2026-10-31T17:00:00.000Z');
    assert.strictEqual(monthStartVN(new Date('2026-10-31T16:59:00Z')).toISOString(), '2026-09-30T17:00:00.000Z');
    assert.strictEqual(monthStartVN(new Date('2026-01-15T05:00:00Z')).toISOString(), '2025-12-31T17:00:00.000Z');
});
test('LS-03 · hạn mức tháng: 0 = không giới hạn và KHÔNG truy vấn CSDL; chỉ đếm lượt đã hoàn tất, không tính T5, đúng khách, đúng tháng', async () => {
    const settings0 = { maxTransfersPerMonth: 0 };
    TR.queries = 0;
    assert.deepStrictEqual(await monthlyStatus(oid(1), settings0), { limit: 0, used: 0, reached: false });
    assert.deepStrictEqual(await monthlyStatus(oid(1), {}), { limit: 0, used: 0, reached: false });
    assert.strictEqual(TR.queries, 0);
    const now = new Date('2026-10-20T10:00:00Z');
    const mk = (over) => ({ customerId: oid(1), status: 'completed', type: 'T2', completedAt: new Date('2026-10-05T10:00:00Z'), ...over });
    TR.docs = [
        mk({}), mk({ type: 'T4' }),
        mk({ type: 'T5' }),                                         // sang tên: không tính
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
test('LS-05 · chia phí: đơn mới trừ phần chia, đơn gốc (đã chuyển đi) cộng đúng phần đó; đơn mới bị hủy sau đó vẫn trừ phần chia', async () => {
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'confirmed', transferFeeAmount: 10000, transferFeeShareOut: 3000 }), 180000 + 10000 - 3000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'completed', transferFeeAmount: 10000, transferFeeShareOut: 3000 }), 187000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'transferred', compensationAmount: 40000, transferFeeShareIn: 3000 }), 43000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'cancelled', refundAmount: 100000, transferFeeAmount: 10000, transferFeeShareOut: 3000 }), 100000 - 10000 + 10000 - 3000);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'manual-ignored', paymentMethod: 'manual', transferFeeShareIn: 5 }), 0);
    assert.strictEqual(entitlementOfBooking({ ...base, status: 'awaiting_payment', transferFeeShareOut: 3000 }), 0);
});
test('LS-06 · BẢO TOÀN: chia phí không làm đổi TỔNG quyền lợi của hai chủ sân, chỉ chuyển giữa họ (mọi tỉ lệ, mọi mức phí)', async () => {
    for (const fee of [0, 5000, 12345, 100000]) for (const pct of [0, 10, 33, 50, 100]) {
        const share = originFeeShare({ type: 'T4', transferFee: fee, pct });
        const oldNoSplit = { ...base, status: 'transferred', compensationAmount: 40000 };
        const newNoSplit = { ...base, status: 'confirmed', transferFeeAmount: fee };
        const oldSplit = { ...oldNoSplit, transferFeeShareIn: share };
        const newSplit = { ...newNoSplit, transferFeeShareOut: share };
        const totalBefore = entitlementOfBooking(oldNoSplit) + entitlementOfBooking(newNoSplit);
        const totalAfter = entitlementOfBooking(oldSplit) + entitlementOfBooking(newSplit);
        assert.strictEqual(totalAfter, totalBefore, `fee ${fee} pct ${pct}`);
        assert.ok(entitlementOfBooking(newSplit) >= entitlementOfBooking({ ...newNoSplit, transferFeeAmount: 0 }), 'chủ sân đích không bị âm phần phí');
    }
});
test('LS-07 · đã gắn đủ: hạn mức kiểm tra TRƯỚC khi giữ chỗ; chụp tỉ lệ lúc báo giá; ghi ShareIn/ShareOut; quyết toán đọc đủ trường; eligibility trả `monthly`; cài đặt & model có trường', async () => {
    const root = path.join(__dirname, '..');
    const ts = fs.readFileSync(path.join(root, 'services', 'transferService.js'), 'utf8');
    assert.ok(ts.indexOf('monthlyStatus(booking.customerId, settings)') > 0 && ts.indexOf('monthlyStatus(') < ts.indexOf('Hold.create'), 'kiểm tra hạn mức trước khi giữ chỗ');
    assert.ok(ts.includes("feeOriginSharePct: type === 'T4'"));
    assert.ok(ts.includes('transferFeeShareOut: feeShare') && ts.includes('transferFeeShareIn: feeShare'));
    assert.ok(fs.readFileSync(path.join(root, 'services', 'settlementService.js'), 'utf8').includes('transferFeeShareIn transferFeeShareOut'));
    assert.ok(/monthly,/.test(fs.readFileSync(path.join(root, 'controllers', 'transferController.js'), 'utf8')));
    const st = fs.readFileSync(path.join(root, 'controllers', 'settingsController.js'), 'utf8');
    assert.ok(st.includes('maxTransfersPerMonth: { min: 0, max: 100 }') && st.includes('transferFeeOriginSharePct: { min: 0, max: 100 }'));
    const ps = fs.readFileSync(path.join(root, 'models', 'PlatformSetting.js'), 'utf8');
    assert.ok(/maxTransfersPerMonth: \{ type: Number, default: 0/.test(ps) && /transferFeeOriginSharePct: \{ type: Number, default: 0/.test(ps));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
