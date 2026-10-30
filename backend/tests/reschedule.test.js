/**
 * KIỂM THỬ ĐỔI LỊCH — logic dựng khung giờ ở frontend (hàm thuần) và dữ liệu eligibility cho trang đổi lịch.
 * Đổi lịch dùng lại engine chuyển sân (loại T1/T2: cùng địa điểm), nên phần tính phí đã được
 * transferPricing.test.js bao phủ; ở đây khoá chặt phần MỚI: giữ nguyên độ dài, không tự chặn mình.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { resolveTransferType, feeRate } = require('../utils/transferPolicy');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
const root = path.join(__dirname, '..', '..');

const ORIGINAL = { date: '2026-10-20', courtId: 'c1', startTime: '18:00', endTime: '20:00' };
const base = { open: '06:00', close: '22:00', durationMin: 120, date: '2026-10-20', courtId: 'c1', original: ORIGINAL, today: '2026-10-09', nowMinutes: 600 };

console.log('\n=== ĐỔI LỊCH ===\n');
let mod;
test('RS-00 · nạp được module ở frontend (ESM)', async () => {
    mod = await import(path.join(root, 'e360sport', 'src', 'utils', 'rescheduleSlots.js'));
    assert.strictEqual(typeof mod.buildRescheduleSlots, 'function');
});
test('RS-01 · độ dài lượt đặt giữ nguyên: lượt 2 giờ cho ra khung 2 giờ, giờ bắt đầu cuối cùng là 20:00 (đóng cửa 22:00)', async () => {
    const slots = mod.buildRescheduleSlots({ ...base, bookedSlots: [] });
    assert.ok(slots.every((s) => mod.durationMinutes(s.start, s.end) === 120));
    assert.strictEqual(slots[0].start, '06:00');
    assert.strictEqual(slots.at(-1).start, '20:00');
    assert.strictEqual(slots.at(-1).end, '22:00');
});
test('RS-02 · giờ hiện tại của chính lượt đặt không chọn lại được, nhưng dời lệch 1 giờ thì được (không tự chặn mình)', async () => {
    const slots = mod.buildRescheduleSlots({ ...base, bookedSlots: [{ start: '18:00', end: '20:00', courtId: 'c1' }] });
    const by = Object.fromEntries(slots.map((s) => [s.start, s]));
    assert.strictEqual(by['18:00'].isBooked, true);
    assert.strictEqual(by['17:00'].isBooked, false, 'dời sớm 1 giờ (17–19) chỉ chồng lên chính lượt đặt này');
    assert.strictEqual(by['19:00'].isBooked, false, 'dời muộn 1 giờ (19–21) chỉ chồng lên chính lượt đặt này');
});
test('RS-03 · người khác đặt thì khung chồng lên bị chặn (kể cả chồng một phần)', async () => {
    const slots = mod.buildRescheduleSlots({ ...base, bookedSlots: [{ start: '10:00', end: '11:00', courtId: 'c1' }] });
    const by = Object.fromEntries(slots.map((s) => [s.start, s]));
    assert.strictEqual(by['08:00'].isBooked, false);   // 08–10 sát nhưng không chồng
    assert.strictEqual(by['09:00'].isBooked, true);    // 09–11 chồng
    assert.strictEqual(by['10:00'].isBooked, true);    // 10–12 chồng
    assert.strictEqual(by['11:00'].isBooked, false);   // 11–13 không chồng
});
test('RS-04 · sang NGÀY KHÁC hoặc SÂN KHÁC thì lượt đặt cũ không còn ảnh hưởng', async () => {
    const otherDay = mod.buildRescheduleSlots({ ...base, date: '2026-10-21', bookedSlots: [] });
    assert.ok(otherDay.every((s) => !s.isBooked));
    const otherCourt = mod.buildRescheduleSlots({ ...base, courtId: 'c2', bookedSlots: [{ start: '18:00', end: '20:00', courtId: 'c2' }] });
    assert.ok(otherCourt.find((s) => s.start === '18:00').isBooked, 'sân khác có người đặt đúng giờ đó vẫn phải bị chặn');
});
test('RS-05 · hôm nay: khung đã bắt đầu thì isPast', async () => {
    const slots = mod.buildRescheduleSlots({ ...base, date: '2026-10-09', nowMinutes: 9 * 60 + 30, bookedSlots: [] });
    const by = Object.fromEntries(slots.map((s) => [s.start, s]));
    assert.strictEqual(by['09:00'].isPast, true);
    assert.strictEqual(by['10:00'].isPast, false);
});
test('RS-06 · lượt 1 giờ vẫn ra đủ khung 06:00 → 21:00', async () => {
    const slots = mod.buildRescheduleSlots({ ...base, durationMin: 60, original: { ...ORIGINAL, endTime: '19:00' }, bookedSlots: [] });
    assert.strictEqual(slots.length, 16);
    assert.strictEqual(slots.at(-1).end, '22:00');
});
test('RS-07 · đổi giờ/đổi sân trong cùng địa điểm là loại T1/T2 → bậc phí "cùng địa điểm" (miễn phí khi còn ≥12 giờ)', async () => {
    const t1 = resolveTransferType({ fromVenueId: 'v', fromCourtId: 'c1', fromOwnerId: 'o', toVenueId: 'v', toCourtId: 'c1', toOwnerId: 'o' });
    const t2 = resolveTransferType({ fromVenueId: 'v', fromCourtId: 'c1', fromOwnerId: 'o', toVenueId: 'v', toCourtId: 'c2', toOwnerId: 'o' });
    assert.deepStrictEqual([t1, t2], ['T1', 'T2']);
    const tiers = [{ minLeadHours: 24, sameVenueRate: 0 }, { minLeadHours: 12, sameVenueRate: 0 }, { minLeadHours: 6, sameVenueRate: 0.03 }, { minLeadHours: 0, sameVenueRate: 0.05 }];
    assert.strictEqual(feeRate({ transferFeeTiers: tiers }, 'T1', 30), 0);
    assert.strictEqual(feeRate({ transferFeeTiers: tiers }, 'T2', 3), 0.05);
});
test('RS-08 · API eligibility trả venueId/courtId để trang đổi lịch biết địa điểm cần mở; route đổi lịch đã đăng ký', async () => {
    const ctrl = fs.readFileSync(path.join(root, 'backend', 'controllers', 'transferController.js'), 'utf8');
    assert.ok(ctrl.includes('venueId: booking.venueId, courtId: booking.courtId'));
    const routes = fs.readFileSync(path.join(root, 'e360sport', 'src', 'routes', 'AppRoutes.jsx'), 'utf8');
    assert.ok(routes.includes('/bookings/:bookingId/reschedule') && routes.includes('mode="reschedule"'));
});

test('RS-09 · chuyển sân cho chọn NHIỀU giờ liền nhau (đổi lịch vẫn khoá độ dài)', async () => {
    const page = fs.readFileSync(path.join(root, 'e360sport', 'src', 'pages', 'customer', 'TransferBooking', 'TransferBooking.jsx'), 'utf8');
    assert.ok(page.includes('toggleSlotSelection') && page.includes('summarizeSlots(selectedSlots)'), 'chuyển sân dùng chọn nhiều ô');
    assert.ok(page.includes('isReschedule && bk'), 'đổi lịch vẫn dùng khung cố định độ dài');
    const sel = await import(path.join(root, 'e360sport', 'src', 'utils', 'slotSelection.js'));
    const slots = ['15:00', '16:00', '17:00', '18:00'].map((st, i) => ({ start: st, end: ['16:00', '17:00', '18:00', '19:00'][i], isBooked: false, isPast: false }));
    let picked = sel.toggleSlotSelection([], slots[0], slots);
    picked = sel.toggleSlotSelection(picked, slots[2], slots);
    assert.deepStrictEqual(sel.summarizeSlots(picked), { start: '15:00', end: '18:00', hours: 3 });
    const svc = fs.readFileSync(path.join(root, 'backend', 'services', 'transferService.js'), 'utf8');
    assert.ok(!svc.includes('phải giữ nguyên độ dài'), 'backend không ép độ dài khi chuyển sân');
});
test('RS-10 · khách không huỷ được đơn đã qua giờ bắt đầu (backend + ẩn nút ở frontend); đơn quên "Hoàn thành" tự đóng sau thời gian ân hạn', async () => {
    const ctrl = fs.readFileSync(path.join(root, 'backend', 'controllers', 'bookingController.js'), 'utf8');
    const cancel = ctrl.slice(ctrl.indexOf('exports.cancelBooking'));
    assert.ok(/leadTimeHours\(booking\.date, booking\.startTime\) <= 0/.test(cancel.slice(0, 1800)));
    const ui = fs.readFileSync(path.join(root, 'e360sport', 'src', 'pages', 'customer', 'BookingHistory', 'BookingHistory.jsx'), 'utf8');
    assert.ok(ui.includes("&& !started"));
    const jobs = fs.readFileSync(path.join(root, 'backend', 'jobs', 'index.js'), 'utf8');
    assert.ok(jobs.includes('async function autoCompleteBookings') && jobs.includes('await autoCompleteBookings()'));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
