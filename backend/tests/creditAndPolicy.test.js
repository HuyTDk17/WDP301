/**
 * KIỂM THỬ BỔ SUNG — những phần bộ test cũ chưa phủ.
 *
 * Chạy: node tests/creditAndPolicy.test.js  (không cần cơ sở dữ liệu)
 *
 * Gồm ba nhóm:
 *   1. UT-07 trong tài liệu (mục 11.1) — quy tắc BR-TR-04 chặn chuyển sân khi
 *      còn dưới 2 tiếng. Bộ test cũ có UT-01..UT-06, UT-08, UT-09 nhưng THIẾU
 *      UT-07, nên quy tắc quan trọng nhất về thời gian chưa từng được kiểm.
 *   2. Múi giờ — bảo đảm lead time không phụ thuộc TZ của hệ điều hành. Đây là
 *      lỗi tiền bạc: lệch 7 tiếng là tra nhầm bậc phí và bậc bồi thường.
 *   3. Tách khoản hoàn thành tiền mặt / số dư khuyến mãi.
 */

// Phải đặt TRƯỚC khi require timeSlots, vì module đọc biến này lúc nạp.
process.env.APP_TZ_OFFSET_MINUTES = '420';
// Cố tình đặt TZ hệ điều hành lệch hẳn để chứng minh kết quả không phụ thuộc nó.
process.env.TZ = 'UTC';

const assert = require('assert');
const { leadTimeHours, toDateTime, calculateAmount, durationHours } = require('../utils/timeSlots');
const { splitRefund } = require('../utils/credit');
const transferService = require('../services/transferService');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(
                () => { console.log(`  ✓ ${name}`); passed += 1; },
                (err) => { console.log(`  ✗ ${name}\n    ${err.message}`); failed += 1; }
            );
        }
        console.log(`  ✓ ${name}`);
        passed += 1;
    } catch (err) {
        console.log(`  ✗ ${name}\n    ${err.message}`);
        failed += 1;
    }
    return Promise.resolve();
}

/** Dựng một ngày/giờ cách hiện tại đúng `hours` tiếng, theo giờ của sân. */
function slotIn(hours) {
    const target = new Date(Date.now() + hours * 3600 * 1000);
    const shifted = new Date(target.getTime() + 420 * 60 * 1000); // sang giờ VN
    return {
        date: shifted.toISOString().slice(0, 10),
        startTime: shifted.toISOString().slice(11, 16),
    };
}

const SETTINGS = {
    transferEnabled: true,
    transferMinLeadTimeHours: 2,
    maxTransfersPerBooking: 1,
};

async function main() {
    console.log('\n=== MÚI GIỜ ===\n');

    await test('TZ-01 · 19:00 giờ Việt Nam = 12:00 UTC, không phụ thuộc TZ máy chủ', () => {
        const d = toDateTime('2026-09-20', '19:00');
        assert.strictEqual(d.toISOString(), '2026-09-20T12:00:00.000Z');
    });

    await test('TZ-02 · Khung giờ qua nửa đêm giờ VN vẫn quy đổi đúng', () => {
        // 01:00 ngày 21/09 giờ VN = 18:00 ngày 20/09 UTC
        const d = toDateTime('2026-09-21', '01:00');
        assert.strictEqual(d.toISOString(), '2026-09-20T18:00:00.000Z');
    });

    await test('TZ-03 · Lead time của một khung giờ cách 5 tiếng ra đúng 5', () => {
        const slot = slotIn(5);
        const L = leadTimeHours(slot.date, slot.startTime);
        assert.ok(Math.abs(L - 5) < 0.05, `L = ${L}, mong đợi ≈ 5`);
    });

    await test('TZ-04 · Khung giờ đã trôi qua cho lead time âm', () => {
        const slot = slotIn(-3);
        assert.ok(leadTimeHours(slot.date, slot.startTime) < 0);
    });

    console.log('\n=== BR-TR-04: NGƯỠNG THỜI GIAN CHUYỂN SÂN (UT-07) ===\n');

    await test('UT-07 · Còn 1,5 giờ → KHÔNG đủ điều kiện chuyển, nêu rõ lý do', async () => {
        const slot = slotIn(1.5);
        const booking = { ...slot, status: 'confirmed', customerId: 'u1', transferCount: 0 };
        const result = await transferService.checkEligibility(booking, SETTINGS);
        assert.strictEqual(result.eligible, false, 'Đáng lẽ phải bị chặn');
        assert.ok(
            result.reasons.some((r) => r.includes('2 tiếng')),
            `Lý do phải nói rõ ngưỡng 2 tiếng, đang trả về: ${JSON.stringify(result.reasons)}`
        );
    });

    await test('UT-07b · Còn 3 giờ → ĐỦ điều kiện chuyển', async () => {
        const slot = slotIn(3);
        const booking = { ...slot, status: 'confirmed', customerId: 'u1', transferCount: 0 };
        const result = await transferService.checkEligibility(booking, SETTINGS);
        assert.strictEqual(result.eligible, true, `Bị chặn nhầm: ${JSON.stringify(result.reasons)}`);
    });

    await test('UT-07c · Khung giờ đã trôi qua → chặn với thông báo riêng', async () => {
        const slot = slotIn(-2);
        const booking = { ...slot, status: 'confirmed', customerId: 'u1', transferCount: 0 };
        const result = await transferService.checkEligibility(booking, SETTINGS);
        assert.strictEqual(result.eligible, false);
        assert.ok(result.reasons.some((r) => r.includes('trôi qua')));
    });

    await test('BR-TR-03 · Đơn thủ công (không có tài khoản) không chuyển được', async () => {
        const slot = slotIn(10);
        const booking = { ...slot, status: 'confirmed', customerId: null, transferCount: 0 };
        const result = await transferService.checkEligibility(booking, SETTINGS);
        assert.strictEqual(result.eligible, false);
        assert.ok(result.reasons.some((r) => r.includes('thủ công')));
    });

    await test('BR-TR-06 · Đơn đã chuyển 1 lần không chuyển tiếp được', async () => {
        const slot = slotIn(10);
        const booking = { ...slot, status: 'confirmed', customerId: 'u1', transferCount: 1 };
        const result = await transferService.checkEligibility(booking, SETTINGS);
        assert.strictEqual(result.eligible, false);
        assert.strictEqual(result.remainingTransfers, 0);
    });

    console.log('\n=== SỐ DƯ KHUYẾN MÃI ===\n');

    await test('CR-01 · Đơn trả toàn bộ bằng tiền mặt → hoàn hết bằng tiền mặt', () => {
        const s = splitRefund(150000, 0, 315000);
        assert.deepStrictEqual(s, { cash: 150000, credit: 0 });
    });

    await test('CR-02 · Đơn trả một phần bằng số dư → hoàn tiền mặt trước, phần dư về số dư', () => {
        // Trả 315.000 gồm 100.000 số dư + 215.000 tiền mặt; hoàn 250.000
        const s = splitRefund(250000, 100000, 315000);
        assert.strictEqual(s.cash, 215000, 'Không được hoàn tiền mặt quá phần đã trả bằng tiền mặt');
        assert.strictEqual(s.credit, 35000);
        assert.strictEqual(s.cash + s.credit, 250000);
    });

    await test('CR-03 · Đơn trả HOÀN TOÀN bằng số dư → không hoàn ra tiền mặt đồng nào', () => {
        const s = splitRefund(300000, 315000, 315000);
        assert.strictEqual(s.cash, 0, 'Số dư khuyến mãi không được biến thành tiền mặt');
        assert.strictEqual(s.credit, 300000);
    });

    await test('CR-04 · Hoàn 0đ thì không sinh khoản nào', () => {
        const s = splitRefund(0, 100000, 315000);
        assert.deepStrictEqual(s, { cash: 0, credit: 0 });
    });

    await test('CR-05 · Tổng hai phần luôn bằng khoản hoàn, trên 1.000 tổ hợp ngẫu nhiên', () => {
        for (let i = 0; i < 1000; i += 1) {
            const paid = Math.round(Math.random() * 2000000);
            const creditUsed = Math.round(Math.random() * paid);
            const refund = Math.round(Math.random() * paid);
            const s = splitRefund(refund, creditUsed, paid);
            assert.strictEqual(s.cash + s.credit, refund, 'Tổng hai phần lệch khoản hoàn');
            assert.ok(s.cash >= 0 && s.credit >= 0, 'Không được có phần âm');
            assert.ok(s.cash <= paid - creditUsed, 'Hoàn tiền mặt vượt phần đã trả bằng tiền mặt');
        }
    });

    console.log('\n=== TÍNH GIÁ THEO SỐ GIỜ ===\n');

    await test('PR-01 · Khung 1,5 tiếng tính đủ 1,5 lần đơn giá', () => {
        assert.strictEqual(durationHours('19:00', '20:30'), 1.5);
        assert.strictEqual(calculateAmount(200000, '19:00', '20:30'), 300000);
    });

    await test('PR-02 · Khung giờ ngược hoặc bằng 0 cho giá bằng 0', () => {
        assert.strictEqual(calculateAmount(200000, '20:00', '19:00'), 0);
        assert.strictEqual(calculateAmount(200000, '19:00', '19:00'), 0);
    });

    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
}

main();
