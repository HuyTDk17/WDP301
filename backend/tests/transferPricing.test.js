/**
 * Kiểm thử công thức tính phí đổi lịch.
 * Chạy: npm test    (không cần cơ sở dữ liệu — transferPricing là hàm thuần)
 *
 * Các kịch bản đầu là ví dụ trong tài liệu đặc tả (chỉ còn đổi lịch T1/T2).
 */
const assert = require('assert');
const { quoteTransfer, verifyBalance } = require('../utils/transferPricing');
const { resolveTransferType, pickTier } = require('../utils/transferPolicy');

const P = (o) => ({
    feeMin: 5000, feeMax: 100000,
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

test('UT-02 · T2 sang sân đắt hơn, còn 30h → bù thêm 115.000đ', () => {
    const q = quoteTransfer(
        { oldAmount: 200000, oldServiceFee: 10000, oldDiscount: 0, newAmount: 300000, newServiceFee: 15000, newDiscount: 0 },
        P({ type: 'T2', leadHours: 30, feeRate: 0.05, compensationRate: 0 })
    );
    assert.strictEqual(q.transferFee, 10000);
    assert.strictEqual(q.compensation, 0);
    assert.strictEqual(q.settlement, 115000);
    assert.strictEqual(q.direction, 'topup');
});

test('UT-03 · T2 sang sân rẻ hơn, còn 8h → hoàn 70.000đ, không có bồi thường', () => {
    const q = quoteTransfer(
        { oldAmount: 300000, oldServiceFee: 15000, oldDiscount: 5000, newAmount: 200000, newServiceFee: 10000, newDiscount: 0 },
        P({ type: 'T2', leadHours: 8, feeRate: 0.10, compensationRate: 0.20 })
    );
    assert.strictEqual(q.transferFee, 30000);
    assert.strictEqual(q.compensation, 0, 'đổi lịch cùng chủ sân nên không bồi thường');
    assert.strictEqual(q.settlement, -70000);
    assert.strictEqual(q.refundCash, 70000);
    assert.strictEqual(q.refundCredit, 0);
});

test('UT-04 · T2 chênh lệch lớn → kích hoạt trần hoàn tiền mặt 50%', () => {
    const q = quoteTransfer(
        { oldAmount: 600000, oldServiceFee: 30000, oldDiscount: 0, newAmount: 150000, newServiceFee: 7500, newDiscount: 0 },
        P({ type: 'T2', leadHours: 30, feeRate: 0.05, compensationRate: 0 })
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
        P({ type: 'T2', leadHours: 30, feeRate: 0.05, compensationRate: 0 })
    );
    assert.strictEqual(q.transferFee, 5000, '50.000 × 5% = 2.500 → nâng lên sàn 5.000');
});

test('UT-06 · Phí tính ra quá lớn → hạ xuống mức tối đa', () => {
    const q = quoteTransfer(
        { oldAmount: 5000000, oldServiceFee: 250000, oldDiscount: 0, newAmount: 5000000, newServiceFee: 250000, newDiscount: 0 },
        P({ type: 'T2', leadHours: 30, feeRate: 0.05, compensationRate: 0 })
    );
    assert.strictEqual(q.transferFee, 100000, '5.000.000 × 5% = 250.000 → hạ xuống trần 100.000');
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
            type: 'T2',
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

test('UT-10 · Phân loại: chỉ còn đổi giờ (T1) và đổi sân cùng địa điểm (T2)', () => {
    const base = { fromVenueId: 'V1', fromCourtId: 'C1' };
    assert.strictEqual(resolveTransferType({ ...base, toVenueId: 'V1', toCourtId: 'C1' }), 'T1');
    assert.strictEqual(resolveTransferType({ ...base, toVenueId: 'V1', toCourtId: 'C2' }), 'T2');
    assert.strictEqual(resolveTransferType({ ...base, toVenueId: 'V2', toCourtId: 'C9' }), null, 'khác địa điểm không còn được hỗ trợ');
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
