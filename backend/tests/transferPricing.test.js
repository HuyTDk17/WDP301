/**
 * Kiểm thử công thức tính phí chuyển sân.
 * Chạy: npm test    (không cần cơ sở dữ liệu — transferPricing là hàm thuần)
 *
 * Bốn kịch bản đầu tương ứng đúng bốn ví dụ trong tài liệu đặc tả.
 */
const assert = require('assert');
const { quoteTransfer, verifyBalance } = require('../utils/transferPricing');
const { resolveTransferType, pickTier } = require('../utils/transferPolicy');

const P = (o) => ({
    feeMin: 5000, feeMax: 100000, fixedFeeT5: 10000,
    maxRefundRatio: 0.5, refundToCreditEnabled: true, ...o,
});

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------- Bốn ví dụ trong tài liệu ----------

test('UT-01 · T1 đổi giờ cùng sân, còn 40h → miễn phí hoàn toàn', () => {
    const q = quoteTransfer(
        { oldAmount: 250000, oldServiceFee: 12500, oldDiscount: 0, newAmount: 250000, newServiceFee: 12500, newDiscount: 0 },
        P({ type: 'T1', leadHours: 40, feeRate: 0, compensationRate: 0 })
    );
    assert.strictEqual(q.transferFee, 0, 'phí 0% thì miễn hẳn, không bị sàn 5.000đ kéo lên');
    assert.strictEqual(q.compensation, 0);
    assert.strictEqual(q.settlement, 0);
    assert.strictEqual(q.direction, 'none');
});

test('UT-02 · T4 sang sân đắt hơn, còn 30h → bù thêm 115.000đ', () => {
    const q = quoteTransfer(
        { oldAmount: 200000, oldServiceFee: 10000, oldDiscount: 0, newAmount: 300000, newServiceFee: 15000, newDiscount: 0 },
        P({ type: 'T4', leadHours: 30, feeRate: 0.05, compensationRate: 0 })
    );
    assert.strictEqual(q.transferFee, 10000);
    assert.strictEqual(q.compensation, 0);
    assert.strictEqual(q.settlement, 115000);
    assert.strictEqual(q.direction, 'topup');
});

test('UT-03 · T4 sang sân rẻ hơn, còn 8h → chỉ được hoàn 10.000đ', () => {
    const q = quoteTransfer(
        { oldAmount: 300000, oldServiceFee: 15000, oldDiscount: 5000, newAmount: 200000, newServiceFee: 10000, newDiscount: 0 },
        P({ type: 'T4', leadHours: 8, feeRate: 0.10, compensationRate: 0.20 })
    );
    assert.strictEqual(q.transferFee, 30000);
    assert.strictEqual(q.compensation, 60000);
    assert.strictEqual(q.settlement, -10000);
    assert.strictEqual(q.refundCash, 10000);
    assert.strictEqual(q.refundCredit, 0);
});

test('UT-04 · T4 chênh lệch lớn → kích hoạt trần hoàn tiền mặt 50%', () => {
    const q = quoteTransfer(
        { oldAmount: 600000, oldServiceFee: 30000, oldDiscount: 0, newAmount: 150000, newServiceFee: 7500, newDiscount: 0 },
        P({ type: 'T4', leadHours: 30, feeRate: 0.05, compensationRate: 0 })
    );
    assert.strictEqual(q.settlement, -442500);
    assert.strictEqual(q.refundCash, 315000);
    assert.strictEqual(q.refundCredit, 127500);
    assert.strictEqual(q.refundCash + q.refundCredit, 442500);
});

// ---------- Chặn trên/chặn dưới ----------

test('UT-05 · Phí tính ra quá nhỏ → nâng lên mức tối thiểu', () => {
    const q = quoteTransfer(
        { oldAmount: 50000, oldServiceFee: 2500, oldDiscount: 0, newAmount: 50000, newServiceFee: 2500, newDiscount: 0 },
        P({ type: 'T4', leadHours: 30, feeRate: 0.05, compensationRate: 0 })
    );
    assert.strictEqual(q.transferFee, 5000, '50.000 × 5% = 2.500 → nâng lên sàn 5.000');
});

test('UT-06 · Phí tính ra quá lớn → hạ xuống mức tối đa', () => {
    const q = quoteTransfer(
        { oldAmount: 5000000, oldServiceFee: 250000, oldDiscount: 0, newAmount: 5000000, newServiceFee: 250000, newDiscount: 0 },
        P({ type: 'T4', leadHours: 30, feeRate: 0.05, compensationRate: 0 })
    );
    assert.strictEqual(q.transferFee, 100000, '5.000.000 × 5% = 250.000 → hạ xuống trần 100.000');
});

test('UT-08 · T5 sang tên → phí cố định, không theo tỉ lệ', () => {
    const q = quoteTransfer(
        { oldAmount: 900000, oldServiceFee: 45000, oldDiscount: 0, newAmount: 900000, newServiceFee: 45000, newDiscount: 0 },
        P({ type: 'T5', leadHours: 5, feeRate: 0.15, compensationRate: 0 })
    );
    assert.strictEqual(q.transferFee, 10000);
    assert.strictEqual(q.settlement, 10000);
});

// ---------- Đẳng thức cân đối ----------

test('UT-09 · Đẳng thức cân đối đúng tuyệt đối trên 2.000 tổ hợp ngẫu nhiên', () => {
    for (let i = 0; i < 2000; i += 1) {
        const oldAmount = Math.round(Math.random() * 2000000 / 1000) * 1000;
        const newAmount = Math.round(Math.random() * 2000000 / 1000) * 1000;
        const rate = 0.05;
        const q = quoteTransfer({
            oldAmount,
            oldServiceFee: Math.round(oldAmount * rate),
            oldDiscount: Math.round(Math.random() * oldAmount * rate),
            newAmount,
            newServiceFee: Math.round(newAmount * rate),
            newDiscount: Math.round(Math.random() * newAmount * rate),
        }, P({
            type: 'T4',
            leadHours: Math.random() * 48,
            feeRate: [0.05, 0.08, 0.10, 0.15][i % 4],
            compensationRate: [0, 0.1, 0.2, 0.4][i % 4],
        }));
        const b = verifyBalance(q);
        assert.ok(b.balanced, `Lệch ${b.diff}đ với oldAmount=${oldAmount} newAmount=${newAmount}`);
        assert.ok(q.refundCash >= 0 && q.refundCredit >= 0, 'Số tiền hoàn không được âm');
        if (q.settlement < 0) {
            assert.strictEqual(q.refundCash + q.refundCredit, -q.settlement, 'Tổng hoàn phải bằng đúng phần chênh');
        }
    }
});

// ---------- Phân loại và tra bậc ----------

test('UT-10 · Phân loại chuyển đúng bốn trường hợp', () => {
    const base = { fromVenueId: 'V1', fromCourtId: 'C1', fromOwnerId: 'O1' };
    assert.strictEqual(resolveTransferType({ ...base, toVenueId: 'V1', toCourtId: 'C1', toOwnerId: 'O1' }), 'T1');
    assert.strictEqual(resolveTransferType({ ...base, toVenueId: 'V1', toCourtId: 'C2', toOwnerId: 'O1' }), 'T2');
    assert.strictEqual(resolveTransferType({ ...base, toVenueId: 'V2', toCourtId: 'C9', toOwnerId: 'O1' }), 'T3');
    assert.strictEqual(resolveTransferType({ ...base, toVenueId: 'V2', toCourtId: 'C9', toOwnerId: 'O2' }), 'T4');
});

test('UT-11 · Tra bậc chọn đúng ngưỡng lớn nhất còn thoả mãn', () => {
    const tiers = [
        { minLeadHours: 24, rate: 0 }, { minLeadHours: 12, rate: 0.1 },
        { minLeadHours: 6, rate: 0.2 }, { minLeadHours: 0, rate: 0.4 },
    ];
    assert.strictEqual(pickTier(tiers, 30).rate, 0);
    assert.strictEqual(pickTier(tiers, 24).rate, 0, 'đúng mốc thì thuộc bậc trên');
    assert.strictEqual(pickTier(tiers, 23.9).rate, 0.1);
    assert.strictEqual(pickTier(tiers, 8).rate, 0.2);
    assert.strictEqual(pickTier(tiers, 2).rate, 0.4);
});

// ---------- Sang tên (T5) ----------

test('UT-12 · Mã sang tên không chứa ký tự dễ đọc nhầm và không trùng lặp', () => {
    const { generateCode } = require('../services/assignmentService');
    const seen = new Set();
    for (let i = 0; i < 5000; i += 1) {
        const code = generateCode();
        assert.strictEqual(code.length, 8);
        assert.ok(/^[A-HJ-NP-Z2-9]+$/.test(code), `Mã "${code}" chứa ký tự dễ nhầm (0, O, 1, I)`);
        seen.add(code);
    }
    // Không phải kiểm định ngẫu nhiên chuẩn mực, nhưng va chạm trong 5.000 lần
    // là dấu hiệu nguồn ngẫu nhiên có vấn đề.
    assert.ok(seen.size > 4990, `Quá nhiều mã trùng: chỉ có ${seen.size}/5000 mã khác nhau`);
});

// ---------- Chạy ----------
let passed = 0;
let failed = 0;
for (const c of cases) {
    try {
        c.fn();
        console.log(`  ✓ ${c.name}`);
        passed += 1;
    } catch (err) {
        console.error(`  ✗ ${c.name}\n    ${err.message}`);
        failed += 1;
    }
}
console.log(`\n${passed} đạt, ${failed} lỗi`);
process.exit(failed ? 1 : 0);
