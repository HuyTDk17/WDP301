/**
 * KIỂM THỬ CHIA HOA HỒNG khách / chủ sân (utils/commission.js).
 * Hàm thuần — không cần CSDL.
 */
const assert = require('assert');
const { splitCommission, ownerNetOf, platformCommissionOf } = require('../utils/commission');

let passed = 0; let failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed += 1; }
    catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
}

console.log('\n=== CHIA HOA HỒNG KHÁCH / CHỦ SÂN ===\n');

test('CM-01 · ví dụ của bạn: giá 200.000đ, hoa hồng 10%, chủ sân chịu hết → khách 200.000, chủ sân nhận 180.000, nền tảng 20.000', () => {
    const f = splitCommission({ amount: 200000, ratePct: 10, customerSharePct: 0 });
    assert.deepStrictEqual(f, { total: 20000, serviceFee: 0, ownerCommission: 20000, ownerNet: 180000 });
    const booking = { amount: 200000, serviceFee: f.serviceFee, ownerCommission: f.ownerCommission };
    assert.strictEqual(200000 + booking.serviceFee, 200000, 'Khách chỉ trả đúng giá niêm yết');
    assert.strictEqual(ownerNetOf(booking), 180000);
    assert.strictEqual(platformCommissionOf(booking), 20000);
});

test('CM-02 · chia đôi 50/50 → khách trả 210.000, chủ sân nhận 190.000, nền tảng vẫn 20.000', () => {
    const f = splitCommission({ amount: 200000, ratePct: 10, customerSharePct: 50 });
    assert.deepStrictEqual(f, { total: 20000, serviceFee: 10000, ownerCommission: 10000, ownerNet: 190000 });
    assert.strictEqual(200000 + f.serviceFee, 210000);
});

test('CM-03 · khách chịu hết (cách tính cũ) → khách trả 220.000, chủ sân nhận đủ 200.000', () => {
    const f = splitCommission({ amount: 200000, ratePct: 10, customerSharePct: 100 });
    assert.deepStrictEqual(f, { total: 20000, serviceFee: 20000, ownerCommission: 0, ownerNet: 200000 });
});

test('CM-04 · luôn bảo toàn: serviceFee + ownerCommission = tổng hoa hồng (kể cả khi làm tròn lẻ)', () => {
    for (const amount of [150000, 333333, 99999, 1, 0]) {
        for (const rate of [0, 3, 5, 7.5, 10, 100]) {
            for (const share of [0, 1, 33, 50, 67, 99, 100]) {
                const f = splitCommission({ amount, ratePct: rate, customerSharePct: share });
                assert.strictEqual(f.serviceFee + f.ownerCommission, f.total, `${amount}/${rate}%/${share}%`);
                assert.ok(f.serviceFee >= 0 && f.ownerCommission >= 0);
                assert.ok(Number.isInteger(f.serviceFee) && Number.isInteger(f.ownerCommission), 'Tiền phải là số nguyên đồng');
            }
        }
    }
});

test('CM-05 · giá trị sai/ngoài khoảng được kẹp lại, không ra số âm hay NaN', () => {
    const f = splitCommission({ amount: 200000, ratePct: 250, customerSharePct: -40 });
    assert.strictEqual(f.total, 200000); // tỉ lệ kẹp về 100%
    assert.strictEqual(f.serviceFee, 0);
    const g = splitCommission({ amount: 'abc', ratePct: 'x', customerSharePct: 'y' });
    assert.deepStrictEqual(g, { total: 0, serviceFee: 0, ownerCommission: 0, ownerNet: 0 });
});

test('CM-06 · đơn cũ (không có ownerCommission) giữ nguyên cách tính: chủ sân nhận đủ amount', () => {
    assert.strictEqual(ownerNetOf({ amount: 200000, serviceFee: 10000 }), 200000);
    assert.strictEqual(platformCommissionOf({ amount: 200000, serviceFee: 10000 }), 10000);
});

console.log(`\n${passed} đạt, ${failed} lỗi\n`);
process.exit(failed ? 1 : 0);
