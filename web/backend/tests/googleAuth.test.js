/**
 * Test đăng nhập/đăng ký bằng Google — chạy hoàn toàn offline: Google (OAuth2Client)
 * và model User đều được giả lập trong bộ nhớ, nên không cần MongoDB hay Client ID thật.
 * Chạy: node tests/googleAuth.test.js  (hoặc `npm test`)
 *
 * Các ca quan trọng nhất là những ca chống CHIẾM TÀI KHOẢN: email chưa được Google xác
 * minh, token cấp cho ứng dụng khác (audience), pre-hijacking, admin/tài khoản bị khoá
 * không bị sửa đổi, email đã gắn với Google khác.
 */
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234567890';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const assert = require('assert');
const B = require('path').resolve(__dirname, '..');

// ---------- 1) Kiểm tra verifyGoogleCredential với OAuth2Client bị stub ----------
const { OAuth2Client } = require(B + '/node_modules/google-auth-library');
let nextPayload = null, lastAudience = null;
OAuth2Client.prototype.verifyIdToken = async function ({ idToken, audience }) {
  lastAudience = audience;
  if (nextPayload === 'THROW') throw new Error('Wrong recipient / bad signature');
  return { getPayload: () => nextPayload };
};
const ga = require(B + '/utils/googleAuth');
const okPayload = { sub: 'g-123', email: 'A.User@Gmail.com ', email_verified: true, name: 'A User', picture: 'https://lh3.googleusercontent.com/x' };
const long = 'x'.repeat(50);

(async () => {
  let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ✓', m); };
  const rejects = async (fn, status, m) => { try { await fn(); assert.fail('không ném lỗi'); } catch (e) { assert.ok(e instanceof ga.GoogleAuthError, 'sai loại lỗi: ' + e.message); assert.strictEqual(e.status, status, `${m}: status ${e.status}`); n++; console.log('  ✓', m, '→', status); } };

  console.log('verifyGoogleCredential');
  nextPayload = okPayload;
  const p = await ga.verifyGoogleCredential(long);
  ok(p.googleId === 'g-123' && p.email === 'a.user@gmail.com', 'chuẩn hoá email về chữ thường, bỏ khoảng trắng');
  ok(lastAudience === process.env.GOOGLE_CLIENT_ID, 'luôn truyền audience = GOOGLE_CLIENT_ID (chống token của app khác)');
  nextPayload = { ...okPayload, email_verified: false };
  await rejects(() => ga.verifyGoogleCredential(long), 403, 'email_verified=false bị từ chối');
  nextPayload = { ...okPayload, email_verified: 'true' };
  await rejects(() => ga.verifyGoogleCredential(long), 403, 'email_verified dạng chuỗi (không phải boolean true) cũng bị từ chối');
  nextPayload = { sub: 'g', email_verified: true };
  await rejects(() => ga.verifyGoogleCredential(long), 401, 'thiếu email bị từ chối');
  nextPayload = 'THROW';
  await rejects(() => ga.verifyGoogleCredential(long), 401, 'token sai chữ ký/audience → 401');
  await rejects(() => ga.verifyGoogleCredential(undefined), 400, 'credential không phải chuỗi → 400');
  await rejects(() => ga.verifyGoogleCredential('short'), 400, 'credential quá ngắn → 400');
  await rejects(() => ga.verifyGoogleCredential('x'.repeat(5000)), 400, 'credential quá dài → 400');
  const saved = process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_ID;
  await rejects(() => ga.verifyGoogleCredential(long), 503, 'chưa cấu hình GOOGLE_CLIENT_ID → 503');
  process.env.GOOGLE_CLIENT_ID = saved;

  // ---------- 2) Controller với User model giả lập trong bộ nhớ ----------
  console.log('googleAuth controller');
  const store = [];
  class FakeUser {
    constructor(d) { Object.assign(this, { _id: 'id' + (store.length + 1), emailVerified: false, role: 'customer', status: 'active', avatar: null, ...d }); }
    async save() { if (!store.includes(this)) store.push(this); return this; }
    toSafeObject() { const o = { ...this }; delete o.password; return o; }
    static async create(d) {
      if (store.some(u => u.email === d.email || (d.googleId && u.googleId === d.googleId))) { const e = new Error('dup'); e.code = 11000; throw e; }
      const u = new FakeUser(d); store.push(u); return u;
    }
    static async findOne(q) {
      if (q.$or) return store.find(u => q.$or.some(c => Object.entries(c).every(([k, v]) => u[k] === v))) || null;
      return store.find(u => Object.entries(q).every(([k, v]) => u[k] === v)) || null;
    }
  }
  const userPath = require.resolve(B + '/models/User');
  require.cache[userPath] = { id: userPath, filename: userPath, loaded: true, exports: FakeUser };
  const notifPath = require.resolve(B + '/models/Notification');
  require.cache[notifPath] = { id: notifPath, filename: notifPath, loaded: true, exports: { create: async () => {} } };
  const ctrl = require(B + '/controllers/authController');

  // asyncHandler không trả về promise → chờ tới khi handler thực sự gọi res.json (hoặc next(err)).
  const call = (credential) => new Promise((resolve, reject) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; resolve(this); return this; } };
    ctrl.googleAuth({ body: { credential } }, res, reject);
  });

  nextPayload = okPayload;
  let r = await call(long);
  ok(r.code === 201 && r.body.isNewUser === true, 'người mới → tạo tài khoản (201, isNewUser)');
  const created = store[0];
  ok(created.emailVerified === true && created.authProvider === 'google' && created.role === 'customer', 'tài khoản mới: emailVerified=true, authProvider=google, role=customer');
  ok(created.googleId === 'g-123' && created.avatar.includes('googleusercontent'), 'lưu googleId và ảnh đại diện Google');
  ok(typeof created.password === 'string' && created.password.length >= 8, 'có mật khẩu ngẫu nhiên thoả ràng buộc schema (≥ 8 ký tự)');
  ok(r.body.token && !r.body.user.password, 'trả JWT, không lộ mật khẩu');

  r = await call(long);
  ok(r.code === 200 && r.body.isNewUser === false && store.length === 1, 'đăng nhập lần 2 → 200, không tạo trùng');

  // liên kết vào tài khoản email/mật khẩu ĐÃ XÁC MINH
  store.length = 0;
  const verified = new FakeUser({ email: 'a.user@gmail.com', password: 'chu-that-biet-mk', emailVerified: true, phone: '0912345678' }); store.push(verified);
  r = await call(long);
  ok(r.code === 200 && verified.googleId === 'g-123' && store.length === 1, 'email đã có (đã xác minh) → LIÊN KẾT, không tạo tài khoản thứ hai');
  ok(verified.password === 'chu-that-biet-mk', 'liên kết vào tài khoản đã xác minh KHÔNG đổi mật khẩu của chủ thật');
  ok(verified.phone === '0912345678', 'không ghi đè dữ liệu có sẵn (số điện thoại)');

  // pre-hijacking
  store.length = 0;
  const hijack = new FakeUser({ email: 'a.user@gmail.com', password: 'mat-khau-cua-ke-tan-cong', emailVerified: false }); store.push(hijack);
  r = await call(long);
  ok(hijack.emailVerified === true && hijack.googleId === 'g-123', 'liên kết vào tài khoản CHƯA xác minh → đánh dấu đã xác minh');
  ok(hijack.password !== 'mat-khau-cua-ke-tan-cong' && hijack.password.length >= 32, 'CHỐNG PRE-HIJACKING: mật khẩu kẻ đăng ký trước bị vô hiệu hoá');

  // banned / admin
  store.length = 0;
  const banned = new FakeUser({ email: 'a.user@gmail.com', password: 'x'.repeat(10), emailVerified: true, googleId: 'g-123', status: 'banned', banReason: 'spam' }); store.push(banned);
  r = await call(long);
  ok(r.code === 403 && /spam/.test(r.body.message) && !r.body.token, 'tài khoản bị khoá → 403 kèm lý do, không cấp token');
  store.length = 0;
  const admin = new FakeUser({ email: 'a.user@gmail.com', password: 'x'.repeat(10), emailVerified: true, googleId: 'g-123', role: 'admin' }); store.push(admin);
  r = await call(long);
  ok(r.code === 403 && !r.body.token, 'tài khoản admin không được vào bằng Google → 403');
  // admin bị "liên kết" bằng email khi googleId chưa có: vẫn phải chặn VÀ không bị sửa gì
  store.length = 0;
  const admin2 = new FakeUser({ email: 'a.user@gmail.com', password: 'mat-khau-admin-that', emailVerified: false, role: 'admin' }); store.push(admin2);
  r = await call(long);
  ok(r.code === 403 && !r.body.token, 'admin chưa từng liên kết Google cũng bị chặn');
  ok(admin2.googleId === undefined && admin2.password === 'mat-khau-admin-that' && admin2.emailVerified === false,
     'admin (emailVerified=false) KHÔNG bị liên kết, KHÔNG bị đổi mật khẩu, KHÔNG bị đánh dấu xác minh');
  // tài khoản đã liên kết Google KHÁC
  store.length = 0;
  const other = new FakeUser({ email: 'a.user@gmail.com', password: 'mk-cu-cua-chu', emailVerified: true, googleId: 'g-KHAC' }); store.push(other);
  r = await call(long);
  ok(r.code === 409 && !r.body.token && other.googleId === 'g-KHAC' && other.password === 'mk-cu-cua-chu', 'email đã gắn với Google khác → 409, không cấp token, không sửa gì');

  // lỗi xác minh chuyển thành phản hồi HTTP đúng mã
  nextPayload = 'THROW';
  r = await call(long);
  ok(r.code === 401 && !r.body.token, 'token Google sai → 401 qua controller');

  console.log(`\n✔ ${n} kiểm tra đạt`);
})().catch(e => { console.error('✘ THẤT BẠI:', e.message); process.exit(1); });
