/**
 * Kiểm thử nhanh end-to-end cho các API: lọc sân theo giá / giờ trống, giữ chỗ tạm,
 * huỷ theo chính sách hoàn tiền, dữ liệu hoá đơn, hồ sơ cá nhân.
 *
 * Chạy khi backend đang bật:  node scripts/e2e-check.cjs
 * Script tự tạo 2 tài khoản thử (email e2e.*@example.com) và in ra ID để dọn dẹp.
 */
const crypto = require('crypto');

const BASE = process.env.API_URL || 'http://localhost:3000/api/v1';

const call = async (method, path, body, token) => {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { s: response.status, d: await response.json() };
};

let pass = 0;
let fail = 0;
const ok = (name, condition, extra = '') => {
  if (condition) pass += 1;
  else fail += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${extra ? ` | ${extra}` : ''}`);
};

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (offset) => {
  const d = new Date(Date.now() + offset * 864e5);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

(async () => {
  const stamp = Date.now();
  const register = async (tag) => {
    const result = await call('POST', '/auth/register', {
      name: `E2E Test ${tag}`,
      email: `e2e.${tag}.${stamp}@example.com`,
      phone: `09${String(stamp).slice(-8)}`,
      password: crypto.randomBytes(9).toString('hex'),
    });
    return result.d.data;
  };
  const A = await register('a');
  const B = await register('b');
  console.log(`USERS ${A.user.id} ${B.user.id}`);

  // ── Lọc theo giá + giờ trống ──────────────────────────────────────────
  const all = await call('GET', '/venues?pageSize=1');
  const cheap = await call('GET', '/venues?maxPrice=100000&pageSize=100');
  ok(
    'price filter narrows results',
    cheap.s === 200 && cheap.d.data.total > 0 && cheap.d.data.total < all.d.data.total,
    `${cheap.d.data.total}/${all.d.data.total}`
  );
  ok(
    'price filter is correct',
    cheap.d.data.items.every((v) => v.minPrice <= 100000 && v.matchingCourts > 0)
  );
  const date = dayKey(5);
  const timed = await call('GET', `/venues?date=${date}&startTime=18:00&endTime=19:00&pageSize=100`);
  ok('time filter works', timed.s === 200 && timed.d.data.total > 0, `total ${timed.d.data.total}`);
  const partial = await call('GET', `/venues?date=${date}`);
  ok('partial time filter rejected', partial.s === 400, partial.d.details?.[0]?.message);

  // ── Chi tiết sân có chính sách huỷ ────────────────────────────────────
  const venueId = timed.d.data.items[0].id;
  const venue = (await call('GET', `/venues/${venueId}`)).d.data;
  ok(
    'venue has cancellationPolicy',
    Array.isArray(venue.cancellationPolicy) && venue.cancellationPolicy.length > 0,
    venue.cancellationPolicy.map((t) => `${t.minLeadHours}h:${t.refundRate}`).join(' ')
  );
  const court = venue.courts[0];
  const availability = async () =>
    (await call('GET', `/venues/${venueId}/courts/${court.id}/availability?date=${date}`)).d.data.slots;
  const slots = await availability();
  const i = slots.findIndex(
    (s, k) => s.available && slots[k + 1]?.available && slots[k + 2]?.available && slots[k + 3]?.available
  );
  const start1 = slots[i].start;
  const end1 = slots[i + 1].end;
  const start2 = slots[i + 2].start;
  const end2 = slots[i + 3].end;
  const isFree = async (time) => (await availability()).find((s) => s.start === time).available;

  // ── Giữ chỗ tạm ───────────────────────────────────────────────────────
  const hold = await call(
    'POST',
    '/slot-holds',
    { courtId: court.id, date, startTime: start1, endTime: end1, purpose: 'transfer' },
    A.accessToken
  );
  ok('create hold', hold.s === 201 && hold.d.data.remainingSeconds > 0, `${start1}-${end1} ttl ${hold.d.data?.remainingSeconds}s`);
  ok('held slot shows unavailable', (await isFree(start1)) === false);
  const hold2 = await call('POST', '/slot-holds', { courtId: court.id, date, startTime: start1, endTime: end1 }, B.accessToken);
  ok('second hold rejected', hold2.s === 409, hold2.d.message);
  const steal = await call('POST', '/bookings', { courtId: court.id, date, startTime: start1, endTime: end1 }, B.accessToken);
  ok('other user cannot book a held slot', steal.s === 409, steal.d.message);
  const got = await call('GET', `/slot-holds/${hold.d.data.holdId}`, null, A.accessToken);
  ok(
    'get hold',
    got.s === 200 && got.d.data.startTime === start1 && got.d.data.endTime === end1 && got.d.data.purpose === 'transfer'
  );
  const mismatch = await call(
    'POST',
    '/bookings',
    { courtId: court.id, date, startTime: start2, endTime: end2, holdId: hold.d.data.holdId },
    A.accessToken
  );
  ok('hold must match the booked slots', mismatch.s === 400, mismatch.d.message);
  const booking = await call(
    'POST',
    '/bookings',
    { courtId: court.id, date, startTime: start1, endTime: end1, holdId: hold.d.data.holdId, notes: 'e2e' },
    A.accessToken
  );
  ok('booking consumes hold', booking.s === 201 && booking.d.data.status === 'confirmed', booking.d.message);
  ok('hold is gone after booking', (await call('GET', `/slot-holds/${hold.d.data.holdId}`, null, A.accessToken)).s === 404);
  ok('slot stays locked by the booking', (await isFree(start1)) === false);
  const hold3 = await call('POST', '/slot-holds', { courtId: court.id, date, startTime: start2, endTime: end2 }, A.accessToken);
  const released = await call('DELETE', `/slot-holds/${hold3.d.data.holdId}`, null, A.accessToken);
  ok('releasing a hold frees the slot', released.d.data.released === true && (await isFree(start2)) === true);

  // Hold này được để lại để kiểm tra hết hạn (xem phần in ra cuối script).
  const hold4 = await call('POST', '/slot-holds', { courtId: court.id, date, startTime: start2, endTime: end2 }, A.accessToken);

  // ── Huỷ theo chính sách ───────────────────────────────────────────────
  const bookingId = booking.d.data.id;
  const quote = await call('GET', `/bookings/${bookingId}/cancellation-quote`, null, A.accessToken);
  ok(
    'quote 5 days ahead refunds 100%',
    quote.s === 200 &&
      quote.d.data.cancellable &&
      quote.d.data.refundRate === 1 &&
      quote.d.data.refundAmount === booking.d.data.amount &&
      quote.d.data.cancellationFee === 0,
    `lead ${quote.d.data.leadHours}h refund ${quote.d.data.refundAmount}`
  );
  const past = await call('POST', '/bookings', { courtId: court.id, date: dayKey(-1), startTime: '10:00', endTime: '11:00' }, A.accessToken);
  ok('booking a past time is rejected', past.s === 400, past.d.message);
  const closed = await call('POST', '/bookings', { courtId: court.id, date, startTime: '02:00', endTime: '03:00' }, A.accessToken);
  ok('booking outside open hours is rejected', closed.s === 400, closed.d.message);

  // ── Dữ liệu hoá đơn ───────────────────────────────────────────────────
  const detail = (await call('GET', `/bookings/${bookingId}`, null, A.accessToken)).d.data;
  ok(
    'booking detail has invoice data',
    !!detail.venueAddress?.city && detail.customer?.name === 'E2E Test a' && detail.notes === 'e2e' && detail.duration === 1,
    JSON.stringify(detail.venueAddress)
  );

  const cancelled = await call('POST', `/bookings/${bookingId}/cancel`, { reason: 'e2e test' }, A.accessToken);
  ok(
    'cancel applies the refund',
    cancelled.s === 200 &&
      cancelled.d.data.status === 'cancelled' &&
      cancelled.d.data.refundAmount === booking.d.data.amount &&
      cancelled.d.data.cancellationFee === 0,
    JSON.stringify(cancelled.d.data)
  );
  ok('cancel frees the slot', (await isFree(start1)) === true);
  ok('double cancel rejected', (await call('POST', `/bookings/${bookingId}/cancel`, {}, A.accessToken)).s === 409);
  const quote2 = await call('GET', `/bookings/${bookingId}/cancellation-quote`, null, A.accessToken);
  ok('cancelled booking is not cancellable', quote2.d.data.cancellable === false, quote2.d.data.reason);
  const notifications = (await call('GET', '/notifications', null, A.accessToken)).d.data;
  ok('cancel creates a notification', notifications.items.some((n) => n.title === 'Đã huỷ đặt sân'), notifications.items[0]?.message);

  // ── Hồ sơ ─────────────────────────────────────────────────────────────
  const profile = await call('GET', '/auth/profile', null, A.accessToken);
  ok(
    'profile returns user + stats',
    profile.s === 200 &&
      profile.d.data.user.email.startsWith('e2e.a.') &&
      profile.d.data.stats.totalBookings === 1 &&
      profile.d.data.stats.cancelledBookings === 1 &&
      !('password' in profile.d.data.user),
    JSON.stringify(profile.d.data.stats)
  );
  ok('profile requires auth', (await call('GET', '/auth/profile')).s === 401);

  console.log(
    `EXPIRY_CHECK ${JSON.stringify({ holdId: hold4.d.data.holdId, venueId, courtId: court.id, date, start: start2, end: end2 })}`
  );
  console.log(`RESULT pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error('CRASH', error);
  process.exit(1);
});
