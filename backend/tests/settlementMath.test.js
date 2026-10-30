/** KIỂM THỬ SỐ DƯ ĐỐI SOÁT chủ sân ↔ nền tảng (utils/settlementMath.js) — hàm thuần. */
const assert = require('assert');
const { entitlementOfBooking, balanceFromData } = require('../utils/settlementMath');

let passed = 0; let failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed += 1; }
    catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
}
const bal = (d) => balanceFromData({ bookings: [], cashPayments: [], ownerRefunds: [], settlements: [], payouts: [], ...d });
const direct = (extra = {}) => ({ status: 'confirmed', paymentMethod: 'bank_transfer', amount: 200000, serviceFee: 0, ownerCommission: 20000, ...extra });
const cash = (amount) => ({ amount });

console.log('\n=== SỐ DƯ ĐỐI SOÁT CHỦ SÂN ↔ NỀN TẢNG ===\n');

test('ST-01 · ví dụ chính: khách chuyển 200.000đ cho chủ sân, hoa hồng 10% → chủ sân nợ nền tảng 20.000đ', () => {
    const r = bal({ bookings: [direct()], cashPayments: [cash(200000)] });
    assert.strictEqual(r.entitlement, 180000);
    assert.strictEqual(r.balance, 20000);
    assert.strictEqual(r.ownerOwesPlatform, 20000);
});

test('ST-02 · nhiều đơn: hoa hồng cộng dồn (3 đơn → nợ 60.000đ)', () => {
    const r = bal({ bookings: [direct(), direct(), direct()], cashPayments: [cash(200000), cash(200000), cash(200000)] });
    assert.strictEqual(r.balance, 60000);
});

test('ST-03 · khách chia đôi hoa hồng (trả 210.000đ): chủ sân giữ 210.000, được hưởng 190.000 → nợ 20.000đ', () => {
    const r = bal({ bookings: [direct({ serviceFee: 10000, ownerCommission: 10000 })], cashPayments: [cash(210000)] });
    assert.strictEqual(r.balance, 20000);
});

test('ST-04 · khuyến mãi 10.000đ do nền tảng tài trợ: khách chuyển 190.000đ → nợ giảm còn 10.000đ', () => {
    const r = bal({ bookings: [direct({ discountAmount: 10000 })], cashPayments: [cash(190000)] });
    assert.strictEqual(r.balance, 10000); // hoa hồng 20.000 − khuyến mãi 10.000
});

test('ST-05 · khách trả bằng số dư/điểm 50.000đ: chủ sân chỉ nhận 150.000đ tiền mặt → NỀN TẢNG nợ chủ sân 30.000đ', () => {
    const r = bal({ bookings: [direct({ creditApplied: 50000 })], cashPayments: [cash(150000)] });
    assert.strictEqual(r.balance, -30000);
    assert.strictEqual(r.platformOwesOwner, 30000);
    assert.strictEqual(r.ownerOwesPlatform, 0);
});

test('ST-06 · đơn trả hoàn toàn bằng số dư (không có tiền mặt): nền tảng nợ đủ phần chủ sân được hưởng', () => {
    const r = bal({ bookings: [direct({ paymentMethod: 'credit', creditApplied: 200000 })], cashPayments: [] });
    assert.strictEqual(r.balance, -180000);
});

test('ST-07 · đơn dữ liệu cũ (nền tảng giữ tiền, không có tiền vào chủ sân): nền tảng nợ chủ sân đúng giá sân', () => {
    const legacy = { status: 'completed', paymentMethod: 'bank_transfer', amount: 200000, serviceFee: 10000 }; // không có ownerCommission
    assert.strictEqual(bal({ bookings: [legacy] }).balance, -200000);
});

test('ST-08 · đơn chủ sân tự tạo (thu tại quầy) KHÔNG tính vào đối soát', () => {
    const r = bal({ bookings: [{ status: 'confirmed', paymentMethod: 'manual', amount: 300000 }] });
    assert.strictEqual(r.balance, 0);
    assert.strictEqual(r.bookingCount, 0);
});

test('ST-09 · chủ sân nộp hoa hồng (hoá đơn owner_pays đã paid) → số dư về 0', () => {
    const r = bal({
        bookings: [direct(), direct()], cashPayments: [cash(200000), cash(200000)],
        settlements: [{ status: 'paid', direction: 'owner_pays', amount: 40000 }],
    });
    assert.strictEqual(r.balance, 0);
});

test('ST-10 · hoá đơn đang chờ (issued/reported) hoặc đã huỷ KHÔNG làm đổi số dư', () => {
    const base = { bookings: [direct()], cashPayments: [cash(200000)] };
    for (const status of ['issued', 'reported', 'cancelled']) {
        assert.strictEqual(bal({ ...base, settlements: [{ status, direction: 'owner_pays', amount: 20000 }] }).balance, 20000, status);
    }
});

test('ST-11 · nền tảng chuyển cho chủ sân (platform_pays paid / phiếu chi cũ) → số dư tiến về 0, không bị chi hai lần', () => {
    const owed = { bookings: [direct({ paymentMethod: 'credit', creditApplied: 200000 })] }; // nợ chủ sân 180.000
    assert.strictEqual(bal({ ...owed, settlements: [{ status: 'paid', direction: 'platform_pays', amount: 180000 }] }).balance, 0);
    assert.strictEqual(bal({ ...owed, payouts: [{ amount: 180000 }] }).balance, 0);
});

test('ST-12 · chủ sân huỷ đơn đã trả: phải hoàn 200.000đ cho khách → không bị tính là đang giữ tiền', () => {
    const r = bal({
        bookings: [direct({ status: 'cancelled' })], // không có trường hoàn → chủ sân huỷ
        cashPayments: [cash(200000)], ownerRefunds: [{ amount: 200000 }],
    });
    assert.strictEqual(r.balance, 0);
});

test('ST-13 · khách huỷ sát giờ, hoàn 50% (100.000đ tiền mặt), chủ sân giữ 100.000đ trừ hoa hồng theo tỉ lệ', () => {
    const cancelled = direct({ status: 'cancelled', refundAmount: 100000, cancellationFee: 100000 });
    assert.strictEqual(entitlementOfBooking(cancelled), 90000); // giữ 100.000 − 10.000 hoa hồng (nửa của 20.000)
    const r = bal({ bookings: [cancelled], cashPayments: [cash(200000)], ownerRefunds: [{ amount: 100000 }] });
    assert.strictEqual(r.balance, 10000); // chủ sân giữ 100.000, được hưởng 90.000
});

test('ST-14 · huỷ khi chưa thanh toán (không có tiền, không có khoản hoàn): không phát sinh gì', () => {
    const r = bal({ bookings: [direct({ status: 'cancelled', paymentMethod: 'manual' }), { status: 'cancelled', amount: 200000, ownerCommission: 20000 }] });
    assert.strictEqual(r.balance, 0);
});

test('ST-15 · chuyển sân cùng chủ, cùng giá: đơn cũ chỉ còn bồi thường 0, đơn mới hưởng 180.000 → chủ sân nợ hoa hồng 20.000', () => {
    const old = direct({ status: 'transferred', compensationAmount: 0 });
    const next = direct({ status: 'confirmed' });
    const r = bal({ bookings: [old, next], cashPayments: [cash(200000)] }); // khách chỉ trả một lần
    assert.strictEqual(r.balance, 20000);
});

test('ST-16 · chuyển sân sang CHỦ KHÁC: chủ cũ giữ tiền nên nợ nền tảng; chủ mới chưa nhận tiền mặt nên được nền tảng nợ', () => {
    const oldOwner = bal({ bookings: [direct({ status: 'transferred', compensationAmount: 30000 })], cashPayments: [cash(200000)] });
    assert.strictEqual(oldOwner.balance, 170000); // giữ 200.000, chỉ được hưởng bồi thường 30.000
    const newOwner = bal({ bookings: [direct({ amount: 250000, ownerCommission: 25000 })] }); // không có tiền mặt vào tay chủ mới
    assert.strictEqual(newOwner.balance, -225000);
});

test('ST-17 · số nguyên đồng, không NaN dù thiếu trường', () => {
    const r = bal({ bookings: [{ status: 'confirmed', amount: 150000 }], cashPayments: [{}] });
    assert.ok(Number.isInteger(r.balance));
});

test('ST-18 · chuyển sân cùng chủ có bù tiền+phí: tiền bù và phí vào tay chủ sân, phí KHÔNG bị tính hoa hồng', () => {
    // Đơn 200.000đ (hoa hồng 20.000) đã chuyển khoản; sang tên T5 phí 10.000đ khách trả thẳng cho chủ sân
    const b = direct({ transferFeeAmount: 10000 });
    assert.strictEqual(entitlementOfBooking(b), 190000);
    const r = bal({ bookings: [b], cashPayments: [cash(200000), cash(10000)] });
    assert.strictEqual(r.balance, 20000, 'Chủ sân chỉ nợ đúng hoa hồng 20.000đ, phí chuyển sân thuộc về họ');
});

test('ST-19 · chuyển sân sang chủ KHÁC có bù tiền: tổng hai chủ sân nợ nền tảng đúng hoa hồng của đơn mới', () => {
    // Đơn cũ 200.000đ ở chủ A. Đơn mới 250.000đ (hoa hồng 25.000) ở chủ B, phí chuyển 10.000đ, bồi thường chủ A 30.000đ.
    // S = 250.000 + 10.000 + 30.000 − 200.000 = 90.000 khách chuyển cho chủ B.
    const a = bal({ bookings: [direct({ status: 'transferred', compensationAmount: 30000 })], cashPayments: [cash(200000)] });
    const b = bal({ bookings: [direct({ amount: 250000, ownerCommission: 25000, transferFeeAmount: 10000 })], cashPayments: [cash(90000)] });
    assert.strictEqual(a.balance, 170000);
    assert.strictEqual(b.balance, 90000 - (225000 + 10000)); // −145.000
    assert.strictEqual(a.balance + b.balance, 25000, 'Tổng hai bên = hoa hồng đơn mới, nền tảng không ăn phí chuyển sân');
});

test('ST-20 · chuyển sân sang sân rẻ hơn, chủ cũ hoàn tiền mặt cho khách: khoản hoàn được trừ vào số dư chủ cũ', () => {
    // Đơn cũ 200.000đ ở chủ A; đơn mới 120.000đ ở chủ B (hoa hồng 12.000), phí 5.000đ, bồi thường A 20.000đ.
    // S = 120.000 + 5.000 + 20.000 − 200.000 = −55.000 → chủ A hoàn 55.000đ tiền mặt cho khách.
    const a = bal({ bookings: [direct({ status: 'transferred', compensationAmount: 20000 })], cashPayments: [cash(200000)], ownerRefunds: [{ amount: 55000 }] });
    const b = bal({ bookings: [direct({ amount: 120000, ownerCommission: 12000, transferFeeAmount: 5000 })] });
    assert.strictEqual(a.balance, 200000 - 55000 - 20000);
    assert.strictEqual(a.balance + b.balance, 12000, 'Tổng hai bên = hoa hồng đơn mới');
});

console.log(`\n${passed} đạt, ${failed} lỗi\n`);
process.exit(failed ? 1 : 0);
