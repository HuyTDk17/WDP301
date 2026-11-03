/** KIỂM THỬ quy tắc sân: MÔN của lượt đặt do sân quyết định. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sportOf, SPORT_IDS } = require('../utils/courtRules');

let passed = 0; let failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed += 1; }
    catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
}
console.log('\n=== QUY TẮC SÂN: MÔN & SỐ NGƯỜI ===\n');

test('CR-01 · môn của lượt đặt luôn là môn của sân', () => {
    assert.strictEqual(sportOf({ type: 'football' }), 'football');
});
test('CR-02 · danh sách môn khớp frontend (utils/index.js SPORTS)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'e360sport', 'src', 'utils', 'index.js'), 'utf8');
    const ids = [...src.matchAll(/\{ id: '(\w+)', name:/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(ids, [...SPORT_IDS].sort());
});
test('CR-03 · controller đặt sân KHÔNG đọc sport từ body để ghi thẳng vào đơn; môn lấy từ sân', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'bookingController.js'), 'utf8');
    assert.ok(!/const \{[^}]*\bsport\b[^}]*\} = req\.body/.test(src), 'không được destructure sport từ req.body');
    assert.ok(src.includes('courtRules.sportOf(court)'));
    assert.ok(!/req\.body\.players/.test(src), 'không còn nhận số người từ client');
});

console.log(`\n${passed} đạt, ${failed} lỗi\n`);
process.exit(failed ? 1 : 0);
