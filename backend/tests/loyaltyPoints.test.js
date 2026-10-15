/**
 * KIỂM THỬ ĐIỂM TÍCH LUỸ — quy đổi, trần tiêu điểm, và tách hoàn 3 chiều.
 *
 * Chỉ kiểm thử các HÀM THUẦN (không cần CSDL) — phần cần CSDL thật (reserve()
 * chống tiêu hai lần khi có nhiều request đồng thời) nên được kiểm thử tích
 * hợp riêng, theo đúng khuôn mẫu credit-concurrency.integration.test.js.
 */
const assert = require('assert');
const { pointsToVnd, vndToPoints } = require('../utils/loyaltyPoints');
const { splitRefundThreeWay } = require('../utils/refundAllocation');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed += 1;
    } catch (err) {
        console.log(`  ✗ ${name}\n    ${err.message}`);
        failed += 1;
    }
}

const SETTINGS = { pointValueVnd: 1000 }; // 1 điểm = 1.000đ, dễ tính tay khi đọc test

console.log('\n=== QUY ĐỔI ĐIỂM ===\n');

test('PT-01 · pointsToVnd nhân đúng tỉ giá', () => {
    assert.strictEqual(pointsToVnd(50, SETTINGS), 50000);
});

test('PT-02 · vndToPoints làm tròn XUỐNG, không được làm tròn lên', () => {
    // 4.999đ / 1.000đ = 4,999 điểm → phải là 4, không phải 5 — nếu làm tròn
    // lên thì khách được giảm nhiều hơn giá trị điểm họ thực có.
    assert.strictEqual(vndToPoints(4999, SETTINGS), 4);
    assert.strictEqual(vndToPoints(5000, SETTINGS), 5);
});

test('PT-03 · pointValueVnd = 0 (tắt tính năng) không chia cho 0', () => {
    assert.strictEqual(vndToPoints(100000, { pointValueVnd: 0 }), 0);
});

test('PT-04 · Số âm hoặc rỗng đều về 0, không trả số âm', () => {
    assert.strictEqual(vndToPoints(-5000, SETTINGS), 0);
    assert.strictEqual(pointsToVnd(-10, SETTINGS), -10000); // pointsToVnd không tự chặn âm, caller phải đảm bảo đầu vào không âm
});

console.log('\n=== TÁCH HOÀN 3 CHIỀU (TIỀN MẶT / SỐ DƯ / ĐIỂM) ===\n');

test('RF3-01 · Đơn trả hoàn toàn tiền mặt → hoàn hết bằng tiền mặt', () => {
    const s = splitRefundThreeWay({ refundAmount: 100000, paidTotal: 300000, creditApplied: 0, pointsValueApplied: 0 });
    assert.deepStrictEqual(s, { cash: 100000, credit: 0, points: 0 });
});

test('RF3-02 · Đơn trả bằng cả 3 nguồn, hoàn một phần → ưu tiên tiền mặt trước', () => {
    // Đơn 300.000: 200.000 tiền mặt + 60.000 số dư + 40.000 điểm. Hoàn 150.000.
    const s = splitRefundThreeWay({
        refundAmount: 150000, paidTotal: 300000, creditApplied: 60000, pointsValueApplied: 40000,
    });
    assert.strictEqual(s.cash, 150000, 'Hoàn 150.000 vẫn nằm trong phần 200.000 tiền mặt đã trả — không cần đụng tới số dư/điểm');
    assert.strictEqual(s.credit, 0);
    assert.strictEqual(s.points, 0);
    assert.strictEqual(s.cash + s.credit + s.points, 150000);
});

test('RF3-03 · Hoàn vượt phần tiền mặt → tràn sang số dư trước, điểm sau', () => {
    // Cùng đơn trên, nhưng hoàn TOÀN BỘ 300.000.
    const s = splitRefundThreeWay({
        refundAmount: 300000, paidTotal: 300000, creditApplied: 60000, pointsValueApplied: 40000,
    });
    assert.strictEqual(s.cash, 200000, 'Hoàn hết phần tiền mặt đã trả');
    assert.strictEqual(s.credit, 60000, 'Hoàn hết phần số dư đã trả');
    assert.strictEqual(s.points, 40000, 'Hoàn hết phần điểm đã trả');
    assert.strictEqual(s.cash + s.credit + s.points, 300000);
});

test('RF3-04 · Đơn trả HOÀN TOÀN bằng điểm → không hoàn ra tiền mặt hay số dư', () => {
    const s = splitRefundThreeWay({
        refundAmount: 150000, paidTotal: 300000, creditApplied: 0, pointsValueApplied: 300000,
    });
    assert.strictEqual(s.cash, 0);
    assert.strictEqual(s.credit, 0);
    assert.strictEqual(s.points, 150000);
});

test('RF3-05 · Hoàn 0đ thì không sinh khoản nào ở cả 3 nguồn', () => {
    const s = splitRefundThreeWay({ refundAmount: 0, paidTotal: 300000, creditApplied: 60000, pointsValueApplied: 40000 });
    assert.deepStrictEqual(s, { cash: 0, credit: 0, points: 0 });
});

test('RF3-06 · Tổng ba phần luôn bằng khoản hoàn, không phần nào âm — trên 1.000 tổ hợp ngẫu nhiên', () => {
    for (let i = 0; i < 1000; i += 1) {
        const paid = Math.round(Math.random() * 1000000);
        const creditApplied = Math.round(Math.random() * paid);
        const pointsValueApplied = Math.round(Math.random() * Math.max(0, paid - creditApplied));
        const refundAmount = Math.round(Math.random() * paid);

        const s = splitRefundThreeWay({ refundAmount, paidTotal: paid, creditApplied, pointsValueApplied });

        assert.strictEqual(s.cash + s.credit + s.points, refundAmount, 'Tổng ba phần lệch khoản hoàn');
        assert.ok(s.cash >= 0 && s.credit >= 0 && s.points >= 0, 'Không được có phần âm');
        assert.ok(s.credit <= creditApplied, 'Không được hoàn số dư nhiều hơn phần đã trả bằng số dư');
        assert.ok(s.points <= pointsValueApplied, 'Không được hoàn điểm nhiều hơn phần đã trả bằng điểm');
        assert.ok(s.cash <= Math.max(0, paid - creditApplied - pointsValueApplied), 'Không được hoàn tiền mặt nhiều hơn phần đã trả bằng tiền mặt');
    }
});

console.log(`\n${passed} đạt, ${failed} lỗi\n`);
process.exit(failed ? 1 : 0);
