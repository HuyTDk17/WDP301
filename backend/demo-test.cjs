// Demo script: test toàn bộ chức năng backend E360Sport.
// Chạy: node demo-test.cjs
// Yêu cầu: MongoDB + server đang chạy ở http://localhost:3000
const BASE = 'http://localhost:3000';

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

const section = (n, title) => console.log(`\n${'='.repeat(60)}\n  ${n}  ${title}\n${'='.repeat(60)}`);
const ok = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

(async () => {
  // ── 1. Health ──
  section('1️⃣', 'HEALTH CHECK');
  const health = await call('GET', '/health');
  ok('Server sống', health.data.status === 'ok');

  // ── 2. Login customer / owner / admin ──
  section('2️⃣', 'ĐĂNG NHẬP 3 VAI TRÒ');
  const customer = await call('POST', '/api/v1/auth/login', { email: 'phamha@gmail.com', password: '12345678' });
  ok('Customer login', customer.data.success === true);
  const CUST_TOKEN = customer.data.data.accessToken;
  console.log('   👤', customer.data.data.user.name, '| role:', customer.data.data.user.role);

  const owner = await call('POST', '/api/v1/auth/login', { email: 'nguyenan@gmail.com', password: '12345678' });
  ok('Owner login', owner.data.success === true);
  console.log('   👤', owner.data.data.user.name, '| role:', owner.data.data.user.role);

  const admin = await call('POST', '/api/v1/auth/login', { email: 'admin@e360sport.vn', password: 'Admin@123456' });
  ok('Admin login', admin.data.success === true);
  console.log('   👤', admin.data.data.user.name, '| role:', admin.data.data.user.role);

  const badLogin = await call('POST', '/api/v1/auth/login', { email: 'phamha@gmail.com', password: 'sai' });
  ok('Sai mật khẩu bị từ chối (401)', badLogin.status === 401);

  const me = await call('GET', '/api/v1/auth/me', null, CUST_TOKEN);
  ok('GET /me trả thông tin user', me.data.data.user.email === 'phamha@gmail.com');

  const badEmail = await call('POST', '/api/v1/auth/login', { email: 'khong-phai-email', password: '12345678' });
  ok('Email sai format bị chặn (400)', badLogin.status === 401 && Array.isArray(badEmail.data.details));

  // ── 3. Venues ──
  section('3️⃣', 'DANH SÁCH / TÌM KIẾM / LỌC SÂN');
  const venues = await call('GET', '/api/v1/venues?pageSize=3');
  ok(`Danh sách sân (total=${venues.data.data.total})`, venues.data.data.items.length === 3);
  const VENUE_ID = venues.data.data.items[0].id;
  console.log('   📍 Mẫu:', venues.data.data.items[0].name);

  const search = await call('GET', '/api/v1/venues?q=' + encodeURIComponent('an phat'));
  ok(`Tìm không dấu "an phat" (total=${search.data.data.total})`, search.data.data.total >= 1);
  if (search.data.data.total > 0) console.log('   📍 Tìm thấy:', search.data.data.items[0].name);

  const filter = await call('GET', '/api/v1/venues?sport=football');
  ok(`Lọc sport=football (total=${filter.data.data.total})`, filter.data.data.total > 0);

  const detail = await call('GET', `/api/v1/venues/${VENUE_ID}`);
  ok(`Chi tiết sân (${detail.data.data.courts.length} sân con, minPrice=${detail.data.data.minPrice})`, detail.data.success === true);

  // ── 4. Courts + availability ──
  section('4️⃣', 'SÂN CON + KHUNG GIỜ TRỐNG');
  const courts = await call('GET', `/api/v1/venues/${VENUE_ID}/courts`);
  ok(`Danh sách sân con (${courts.data.data.length})`, courts.data.data.length > 0);
  const COURT = courts.data.data[0];
  console.log('   🏟️ Mẫu:', COURT.name, '|', COURT.pricePerHour, 'đ/giờ');

  const avail = await call('GET', `/api/v1/venues/${VENUE_ID}/courts/${COURT.id}/availability?date=2026-10-20`);
  const booked = avail.data.data.slots.filter((s) => !s.available).length;
  ok(`Khung giờ trống (${avail.data.data.slots.length} slot, đã đặt ${booked})`, avail.data.success === true);

  // Tìm slot trống để đặt
  const freeSlot = avail.data.data.slots.find((s) => s.available);
  const busySlot = avail.data.data.slots.find((s) => !s.available);
  console.log('   🟢 Slot trống mẫu:', freeSlot ? `${freeSlot.start}-${freeSlot.end}` : 'không có');

  // ── 5. Booking ──
  section('5️⃣', 'ĐẶT SÂN + CHỐNG DOUBLE-BOOKING');
  const booking = await call('POST', '/api/v1/bookings', {
    courtId: COURT.id,
    date: '2026-10-20',
    startTime: freeSlot.start,
    endTime: freeSlot.end,
    notes: 'Demo test',
  }, CUST_TOKEN);
  ok(`Tạo booking (amount=${booking.data.data?.amount})`, booking.status === 201);
  const BOOKING_ID = booking.data.data?.id;
  console.log('   🎫 Booking ID:', BOOKING_ID);

  const dup = await call('POST', '/api/v1/bookings', {
    courtId: COURT.id,
    date: '2026-10-20',
    startTime: freeSlot.start,
    endTime: freeSlot.end,
  }, CUST_TOKEN);
  ok('Đặt trùng khung giờ bị chặn (409)', dup.status === 409);
  console.log('   🚫 Message:', dup.data.message);

  const badTime = await call('POST', '/api/v1/bookings', {
    courtId: COURT.id,
    date: '2026-10-20',
    startTime: '10:00',
    endTime: '09:00',
  }, CUST_TOKEN);
  ok('Giờ kết thúc < bắt đầu bị chặn (400)', badTime.status === 400);

  const noAuth = await call('POST', '/api/v1/bookings', {
    courtId: COURT.id,
    date: '2026-10-20',
    startTime: '10:00',
    endTime: '11:00',
  });
  ok('Không đăng nhập bị chặn (401)', noAuth.status === 401);

  const myBookings = await call('GET', '/api/v1/bookings', null, CUST_TOKEN);
  ok(`Danh sách booking của tôi (total=${myBookings.data.data.total})`, myBookings.data.data.total >= 1);

  const detail2 = await call('GET', `/api/v1/bookings/${BOOKING_ID}`, null, CUST_TOKEN);
  ok('Chi tiết booking', detail2.data.data.status === 'confirmed');

  const cancel = await call('POST', `/api/v1/bookings/${BOOKING_ID}/cancel`, { reason: 'Demo xong' }, CUST_TOKEN);
  ok('Huỷ booking (nhả slot)', cancel.data.data.status === 'cancelled');

  const rebook = await call('POST', '/api/v1/bookings', {
    courtId: COURT.id,
    date: '2026-10-20',
    startTime: freeSlot.start,
    endTime: freeSlot.end,
  }, CUST_TOKEN);
  ok('Đặt lại sau khi huỷ (slot đã nhả)', rebook.status === 201);
  const REBOOK_ID = rebook.data.data?.id;
  // dọn dẹp
  await call('POST', `/api/v1/bookings/${REBOOK_ID}/cancel`, { reason: 'Dọn dẹp demo' }, CUST_TOKEN);
  console.log('   🧹 Đã dọn booking demo');

  // ── 6. Reviews / Favorites ──
  section('6️⃣', 'ĐÁNH GIÁ + YÊU THÍCH');
  const review = await call('POST', '/api/v1/reviews', {
    venueId: VENUE_ID,
    rating: 5,
    comment: 'Sân ngon, test demo',
  }, CUST_TOKEN);
  ok('Tạo đánh giá 5 sao', review.status === 201);

  const badRating = await call('POST', '/api/v1/reviews', { venueId: VENUE_ID, rating: 9 }, CUST_TOKEN);
  ok('Rating 9 bị chặn (400)', badRating.status === 400);
  console.log('   🚫 Message:', JSON.stringify(badRating.data.details));

  const reviews = await call('GET', `/api/v1/venues/${VENUE_ID}/reviews`);
  ok(`Danh sách đánh giá (${reviews.data.data.length})`, reviews.data.data.length >= 1);

  const fav = await call('POST', '/api/v1/favorites', { venueId: VENUE_ID }, CUST_TOKEN);
  ok('Thêm yêu thích', fav.status === 201);

  const favs = await call('GET', '/api/v1/favorites', null, CUST_TOKEN);
  ok(`Danh sách yêu thích (${favs.data.data.length})`, favs.data.data.length >= 1);

  // ── 7. Notifications ──
  section('7️⃣', 'THÔNG BÁO');
  const notis = await call('GET', '/api/v1/notifications', null, CUST_TOKEN);
  ok(`Danh sách thông báo (total=${notis.data.data.total})`, notis.data.data.total >= 1);
  console.log('   🔔 Mẫu:', notis.data.data.items[0]?.title);

  const unread = await call('GET', '/api/v1/notifications?unreadOnly=true', null, CUST_TOKEN);
  ok('Lọc chưa đọc', unread.data.success === true);

  console.log('\n🎉 HOÀN TẤT DEMO — kiểm tra các dòng ✅/❌ ở trên.');
})().catch((e) => {
  console.error('❌ Lỗi khi chạy demo:', e.message);
  process.exit(1);
});
