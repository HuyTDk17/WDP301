/** KIỂM THỬ GỢI Ý SÂN THAY THẾ (Excel: "Build Field-Matching Service for Transfer Requests") — phần thuần + đấu nối route. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { candidateWindows, rankSuggestions } = require('../utils/transferSuggestions');

let passed = 0; let failed = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });

test('TS-01 · giờ ứng viên giữ nguyên độ dài, sắp theo độ lệch: 0, -1h, +1h, -2h, +2h', () => {
    const w = candidateWindows({ startTime: '18:00', endTime: '20:00', open: '06:00', close: '22:00' });
    assert.deepStrictEqual(w.map((x) => x.startTime), ['18:00', '17:00', '19:00', '16:00', '20:00']);
    assert.ok(w.every((x) => Number(x.endTime.slice(0, 2)) - Number(x.startTime.slice(0, 2)) === 2));
});
test('TS-02 · không vượt giờ mở/đóng cửa (lượt 2 giờ sát giờ đóng cửa chỉ lệch về phía sớm)', () => {
    const w = candidateWindows({ startTime: '20:00', endTime: '22:00', open: '06:00', close: '22:00' });
    assert.deepStrictEqual(w.map((x) => x.startTime), ['20:00', '19:00', '18:00']);
    assert.deepStrictEqual(candidateWindows({ startTime: '05:00', endTime: '06:00', open: '06:00', close: '22:00' }).map((x) => x.startTime), ['06:00', '07:00']);
});
test('TS-03 · khung giờ lẻ 30 phút (15:30–16:30) vẫn ra ứng viên đúng bước 1 giờ', () => {
    const w = candidateWindows({ startTime: '15:30', endTime: '16:30', open: '05:30', close: '22:00' });
    assert.deepStrictEqual(w.slice(0, 3).map((x) => [x.startTime, x.endTime]), [['15:30', '16:30'], ['14:30', '15:30'], ['16:30', '17:30']]);
});
test('TS-04 · đầu vào sai (kết thúc ≤ bắt đầu) → không có ứng viên', () => {
    assert.deepStrictEqual(candidateWindows({ startTime: '20:00', endTime: '19:00' }), []);
});
test('TS-05 · xếp hạng: giờ gần giờ gốc trước, rồi cùng địa điểm, rồi giá gần giá cũ; cắt theo limit', () => {
    const mk = (venueName, shiftMinutes, sameVenue, priceDiff) => ({ venueName, shiftMinutes, sameVenue, priceDiff });
    const r = rankSuggestions([mk('D', 60, true, 0), mk('C', 0, false, 50000), mk('B', 0, true, 90000), mk('A', 0, false, -10000)], 3);
    assert.deepStrictEqual(r.map((x) => x.venueName), ['B', 'A', 'C']);
});
test('TS-06 · đã nối vào route GET /bookings/:id/transfer/suggestions, controller, service và frontend', () => {
    const root = path.join(__dirname, '..', '..');
    const rd = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
    assert.ok(rd('backend', 'routes', 'bookingRoutes.js').includes("'/:id/transfer/suggestions', transferController.getSuggestions"));
    assert.ok(rd('backend', 'controllers', 'transferController.js').includes('exports.getSuggestions'));
    assert.ok(/suggestReplacements,/.test(rd('backend', 'services', 'transferService.js')));
    assert.ok(rd('e360sport', 'src', 'services', 'transferService.js').includes('/transfer/suggestions'));
    assert.ok(rd('e360sport', 'src', 'pages', 'customer', 'TransferBooking', 'TransferBooking.jsx').includes('getSuggestions(bookingId)'));
});

(async () => {
    console.log('\n=== GỢI Ý SÂN THAY THẾ ===\n');
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; } catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
