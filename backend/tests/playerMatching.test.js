/**
 * KIỂM THỬ TÌM NGƯỜI CHƠI CHUNG: đăng bài → xin tham gia → chấp nhận/từ chối → trao đổi SĐT (+ liên kết Zalo).
 * Model thay bằng bản giả trong bộ nhớ (không cần MongoDB), có mô phỏng chỉ mục duy nhất một phần (lỗi 11000) và cập nhật
 * có điều kiện kiểu findOneAndUpdate. Khoá chặt: SĐT chỉ lộ SAU KHI được ghép; không vượt quá số chỗ kể cả khi hai lần
 * chấp nhận chạy cùng lúc; mỗi lượt đặt một bài; chống spam; bài đóng khi lượt đặt mất hiệu lực.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
const resolve = (rel) => require.resolve(path.join(__dirname, '..', rel));
function fake(rel, exports) { const f = resolve(rel); require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] }; }
const oid = (n) => Number(n).toString(16).padStart(24, '0');

// ── kho giả ──
let seq = 9000;
const getPath = (d, k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), d);
function match(doc, filter = {}) {
    return Object.entries(filter).every(([k, cond]) => {
        const v = getPath(doc, k);
        if (cond === null) return v == null;
        if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('$in' in cond) return cond.$in.map(String).includes(String(v));
            if ('$nin' in cond) return !cond.$nin.map(String).includes(String(v));
            if ('$gt' in cond) return v > cond.$gt;
            if ('$gte' in cond) return v >= cond.$gte;
            if ('$lt' in cond) return v < cond.$lt;
            if ('$lte' in cond) return v <= cond.$lte;
        }
        return String(v) === String(cond);
    });
}
function applyUpdate(doc, update) {
    for (const [k, v] of Object.entries(update)) {
        if (k === '$inc') Object.entries(v).forEach(([f, n]) => { doc[f] = (doc[f] || 0) + n; });
        else doc[k] = v;
    }
}
const thenable = (get, extra = {}) => { const self = { then: (a, b) => Promise.resolve(get()).then(a, b), catch: (b) => Promise.resolve(get()).catch(b), select: () => self, ...extra }; return self; };
function makeModel(defaults = {}, uniques = []) {
    const M = { docs: [] };
    const decorate = (d) => {
        const doc = { ...defaults, ...d };
        doc.save = async () => doc;
        doc.toObject = () => ({ ...doc, save: undefined, toObject: undefined });
        return doc;
    };
    const violates = (doc) => uniques.some((u) => u.when(doc) && M.docs.some((x) => u.when(x) && u.fields.every((f) => String(x[f]) === String(doc[f]))));
    M.create = async (d) => {
        const doc = decorate({ _id: oid(++seq), createdAt: new Date(), ...d });
        if (violates(doc)) { const e = new Error('duplicate key'); e.code = 11000; throw e; }
        M.docs.push(doc); return doc;
    };
    M.exists = async (f) => (M.docs.find((d) => match(d, f)) ? { _id: 1 } : null);
    M.countDocuments = async (f) => M.docs.filter((d) => match(d, f)).length;
    M.findOne = (f) => thenable(() => M.docs.find((d) => match(d, f)) || null);
    M.findById = (id) => thenable(() => M.docs.find((d) => d._id === id) || null);
    M.find = (f) => {
        let sortSpec = null; let skip = 0; let lim = Infinity;
        const run = () => {
            let rows = M.docs.filter((d) => match(d, f));
            if (sortSpec) { const [k, dir] = Object.entries(sortSpec)[0]; rows = [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir); }
            return rows.slice(skip, skip + lim);
        };
        const self = thenable(run, { sort: (o) => { sortSpec = o; return self; }, skip: (n) => { skip = n; return self; }, limit: (n) => { lim = n; return self; } });
        return self;
    };
    M.findOneAndUpdate = async (f, update) => { const d = M.docs.find((x) => match(x, f)); if (!d) return null; applyUpdate(d, update); return d; };
    M.updateOne = async (f, update) => { const d = M.docs.find((x) => match(x, f)); if (d) applyUpdate(d, update); };
    return M;
}
const PlayerPost = makeModel({ status: 'open', active: true, acceptedCount: 0, level: 'any', note: '' }, [{ fields: ['bookingId'], when: (d) => d.active === true && d.bookingId != null }]);
const JoinRequest = makeModel({ status: 'pending', active: true, message: '' }, [{ fields: ['postId', 'userId'], when: (d) => d.active === true }]);
const Booking = makeModel(); const User = makeModel(); const Notification = makeModel();
fake('models/PlayerPost.js', PlayerPost); fake('models/JoinRequest.js', JoinRequest);
const Venue = makeModel(); const Court = makeModel();
let blockedOwners = new Set();
fake('models/Booking.js', Booking); fake('models/User.js', User); fake('models/Notification.js', Notification);
fake('models/Venue.js', Venue); fake('models/Court.js', Court);
fake('services/settlementService.js', { isOwnerBlocked: async (id) => blockedOwners.has(String(id)) });
const ctrl = require('../controllers/playerController');
const svc = require('../services/playerService');
const { zaloUrl } = require('../utils/zalo');

const call = (handler, req) => new Promise((ok, bad) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; ok(this); return this; } };
    handler({ body: {}, params: {}, query: {}, ...req }, res, (e) => bad(e));
});
const H = 3600000; const DAY = 24 * H;
const vnDate = (offsetMs) => new Date(Date.now() + offsetMs + 7 * H).toISOString().slice(0, 10);
const U = (n, over = {}) => ({ _id: oid(n), name: `Người ${n}`, role: 'customer', phone: `09000000${String(n).padStart(2, '0')}`, ...over });
const HOST = U(1); const P2 = U(2); const P3 = U(3); const P4 = U(4);
const V1 = oid(50);
function reset() {
    for (const M of [PlayerPost, JoinRequest, Booking, User, Notification, Venue, Court]) M.docs = [];
    blockedOwners = new Set();
    [HOST, P2, P3, P4].forEach((u) => User.docs.push({ ...u, email: `u${u._id.slice(-2)}@x.vn`, avatar: null }));
}
const addBooking = (over = {}) => Booking.create({ customerId: HOST._id, venueId: V1, venueName: 'Sân Mỹ Đình', courtName: 'Sân 1', sport: 'football', date: vnDate(2 * DAY), startTime: '18:00', endTime: '20:00', status: 'confirmed', ...over });
async function newPost(over = {}) {
    const b = await addBooking();
    const r = await call(ctrl.createPost, { user: HOST, body: { bookingId: b._id, slotsNeeded: 2, level: 'any', ...over } });
    assert.strictEqual(r.code, 201, JSON.stringify(r.body));
    return { post: PlayerPost.docs.find((p) => p._id === r.body.post._id), booking: b };
}
const join = (user, post, message = '') => call(ctrl.joinPost, { user, params: { id: post._id }, body: { message } });
const respond = (user, requestId, decision) => call(ctrl.respondToRequest, { user, params: { requestId }, body: { decision } });
const notesTo = (userId) => Notification.docs.filter((n) => n.userId === userId);

console.log('\n=== TÌM NGƯỜI CHƠI CHUNG ===\n');
test('PM-01 · Zalo: chuẩn hóa số, nhận dạng 84xxxxxxxxx, từ chối số sai', async () => {
    assert.strictEqual(zaloUrl('0912345678'), 'https://zalo.me/0912345678');
    assert.strictEqual(zaloUrl('84912345678'), 'https://zalo.me/0912345678');
    assert.strictEqual(zaloUrl('0912 345 678'), 'https://zalo.me/0912345678');
    for (const bad of ['', null, undefined, '123', '09123456789', 'abc']) assert.strictEqual(zaloUrl(bad), '', String(bad));
});
test('PM-02 · đăng bài: kiểm tra đầu vào; chỉ lượt đặt của mình, đã xác nhận, chưa bắt đầu', async () => {
    reset();
    const b = await addBooking();
    const post = (user, body) => call(ctrl.createPost, { user, body });
    assert.strictEqual((await post({ ...HOST, phone: '' }, { bookingId: b._id, slotsNeeded: 2 })).code, 400);
    for (const n of [0, 21, 1.5, 'x', undefined]) assert.strictEqual((await post(HOST, { bookingId: b._id, slotsNeeded: n })).code, 400, String(n));
    assert.strictEqual((await post(HOST, { bookingId: b._id, slotsNeeded: 2, level: 'pro' })).code, 400);
    assert.strictEqual((await post(HOST, { bookingId: b._id, slotsNeeded: 2, note: 'x'.repeat(301) })).code, 400);
    assert.strictEqual((await post(HOST, { bookingId: 'xyz', slotsNeeded: 2 })).code, 400);
    assert.strictEqual((await post(P2, { bookingId: b._id, slotsNeeded: 2 })).code, 404);
    const unpaid = await addBooking({ status: 'awaiting_payment' });
    assert.strictEqual((await post(HOST, { bookingId: unpaid._id, slotsNeeded: 2 })).code, 409);
    const started = await addBooking({ date: vnDate(-DAY) });
    assert.strictEqual((await post(HOST, { bookingId: started._id, slotsNeeded: 2 })).code, 409);
    assert.strictEqual(PlayerPost.docs.length, 0);
});
test('PM-03 · đăng thành công: sao chép sân/giờ từ lượt đặt, giờ bắt đầu theo giờ Việt Nam; mỗi lượt đặt một bài; tối đa 5 bài chưa diễn ra', async () => {
    reset();
    const b = await addBooking({ date: '2099-10-20' });
    const r = await call(ctrl.createPost, { user: HOST, body: { bookingId: b._id, slotsNeeded: 3, level: 'intermediate', note: ' Chơi vui ' } });
    assert.strictEqual(r.code, 201);
    const p = r.body.post;
    assert.deepStrictEqual([p.sport, p.venueName, p.startTime, p.slotsNeeded, p.level, p.note], ['football', 'Sân Mỹ Đình', '18:00', 3, 'intermediate', 'Chơi vui']);
    assert.strictEqual(new Date(p.startsAt).toISOString(), '2099-10-20T11:00:00.000Z');
    assert.strictEqual((await call(ctrl.createPost, { user: HOST, body: { bookingId: b._id, slotsNeeded: 1 } })).code, 409);
    for (let i = 0; i < 4; i += 1) { const bb = await addBooking(); assert.strictEqual((await call(ctrl.createPost, { user: HOST, body: { bookingId: bb._id, slotsNeeded: 1 } })).code, 201); }
    const sixth = await addBooking();
    assert.strictEqual((await call(ctrl.createPost, { user: HOST, body: { bookingId: sixth._id, slotsNeeded: 1 } })).code, 429);
});
test('PM-04 · danh sách: chỉ bài còn chỗ, chưa bắt đầu, lượt đặt còn hiệu lực; lọc theo môn/ngày/trình độ; KHÔNG lộ SĐT/email', async () => {
    reset();
    const a = (await newPost({ level: 'beginner' })).post;
    await newPost({ level: 'any' });
    const hidden = await newPost();
    hidden.post.status = 'full';
    const cancelled = await newPost();
    cancelled.booking.status = 'cancelled';                // hook chưa kịp đóng bài — vẫn không được hiện
    const closed = await newPost(); closed.post.status = 'closed'; closed.post.active = false;
    const list = await call(ctrl.listPosts, { user: P2, query: {} });
    assert.strictEqual(list.body.posts.length, 2);
    const text = JSON.stringify(list.body);
    assert.ok(!/phone|email|@x\.vn|0900000/.test(text), 'không được lộ SĐT/email');
    assert.strictEqual(list.body.posts[0].host.name, 'Người 1');
    assert.strictEqual((await call(ctrl.listPosts, { user: P2, query: { sport: 'tennis' } })).body.posts.length, 0);
    assert.strictEqual((await call(ctrl.listPosts, { user: P2, query: { level: 'intermediate' } })).body.posts.length, 1, 'trình độ khác thì chỉ còn bài "mọi trình độ"');
    assert.strictEqual((await call(ctrl.listPosts, { user: P2, query: { level: 'beginner' } })).body.posts.length, 2);
    assert.strictEqual((await call(ctrl.listPosts, { user: P2, query: { date: a.date } })).body.posts.length, 2);
    assert.strictEqual((await call(ctrl.listPosts, { user: P2, query: { date: 'abc' } })).code, 400);
    assert.strictEqual((await call(ctrl.listPosts, { user: HOST, query: {} })).body.posts[0].isMine, true);
});
test('PM-05 · xin tham gia: không xin vào nhóm mình/nhóm đầy/đã đóng/đã bắt đầu/lượt đặt đã hủy; không xin trùng; tối đa 10 yêu cầu chờ; báo chủ nhóm', async () => {
    reset();
    const { post, booking } = await newPost();
    assert.strictEqual((await join(HOST, post)).code, 400);
    assert.strictEqual((await join({ ...P2, phone: '' }, post)).code, 400);
    assert.strictEqual((await join(P2, post, 'x'.repeat(201))).code, 400);
    const ok = await join(P2, post, 'Mình chơi được 2 tiếng');
    assert.strictEqual(ok.code, 201);
    assert.ok(notesTo(HOST._id).some((n) => /Người 2/.test(n.message)));
    assert.strictEqual((await join(P2, post)).code, 409);
    post.status = 'full'; assert.strictEqual((await join(P3, post)).code, 409);
    post.status = 'closed'; assert.strictEqual((await join(P3, post)).code, 409);
    post.status = 'open'; post.startsAt = new Date(Date.now() - H); assert.strictEqual((await join(P3, post)).code, 409);
    post.startsAt = new Date(Date.now() + DAY); booking.status = 'cancelled'; assert.strictEqual((await join(P3, post)).code, 409);
    booking.status = 'confirmed';
    for (let i = 0; i < 10; i += 1) JoinRequest.docs.push({ _id: oid(7000 + i), postId: oid(8000 + i), userId: P4._id, status: 'pending', active: true });
    assert.strictEqual((await join(P4, post)).code, 429);
});
test('PM-06 · chấp nhận: giữ chỗ nguyên tử — hai lần chấp nhận cùng lúc cho chỗ cuối thì chỉ một thành công; đủ người thì bài chuyển "full"', async () => {
    reset();
    const { post } = await newPost({ slotsNeeded: 1 });
    await join(P2, post); await join(P3, post);
    const [r2, r3] = JoinRequest.docs;
    const [a, b] = await Promise.all([respond(HOST, r2._id, 'accept'), respond(HOST, r3._id, 'accept')]);
    assert.deepStrictEqual([a.code, b.code].sort(), [200, 409]);
    assert.strictEqual(post.acceptedCount, 1);
    assert.strictEqual(post.status, 'full');
    assert.strictEqual(JoinRequest.docs.filter((r) => r.status === 'accepted').length, 1);
    const winner = a.code === 200 ? a : b;
    assert.ok(winner.body.contact.phone && winner.body.contact.zaloUrl.startsWith('https://zalo.me/09'));
    assert.ok(notesTo(winner.body.request.userId).some((n) => /được nhận/.test(n.title)));
});
test('PM-07 · phân quyền & từ chối: chỉ chủ nhóm xử lý (người khác nhận 404 như không tồn tại); đã xử lý → 409; từ chối không tốn chỗ', async () => {
    reset();
    const { post } = await newPost({ slotsNeeded: 2 });
    await join(P2, post); await join(P3, post);
    const [r2, r3] = JoinRequest.docs;
    const stranger = await respond(P4, r2._id, 'accept');
    const missing = await respond(P4, oid(999), 'accept');
    assert.strictEqual(stranger.code, 404);
    assert.deepStrictEqual(stranger.body, missing.body);
    assert.strictEqual((await respond(P2, r2._id, 'accept')).code, 404, 'người xin không tự duyệt cho mình');
    assert.strictEqual((await respond(HOST, r2._id, 'maybe')).code, 400);
    const rej = await respond(HOST, r2._id, 'reject');
    assert.deepStrictEqual([rej.code, r2.status, post.acceptedCount], [200, 'rejected', 0]);
    assert.ok(notesTo(P2._id).some((n) => /chưa được nhận/.test(n.title)));
    assert.strictEqual((await respond(HOST, r2._id, 'accept')).code, 409);
    assert.strictEqual((await join(P2, post)).code, 409, 'bị từ chối thì không xin lại được');
    assert.strictEqual((await respond(HOST, r3._id, 'accept')).code, 200);
});
test('PM-08 · rút lui: người đã được nhận rút thì bài mở lại và chủ nhóm được báo; chỉ rút được yêu cầu của mình; rút xong xin lại được', async () => {
    reset();
    const { post } = await newPost({ slotsNeeded: 1 });
    await join(P2, post);
    const r2 = JoinRequest.docs[0];
    await respond(HOST, r2._id, 'accept');
    assert.strictEqual(post.status, 'full');
    assert.strictEqual((await call(ctrl.withdrawRequest, { user: P3, params: { requestId: r2._id } })).code, 404);
    const before = notesTo(HOST._id).length;
    const w = await call(ctrl.withdrawRequest, { user: P2, params: { requestId: r2._id } });
    assert.deepStrictEqual([w.code, r2.status, r2.active, post.acceptedCount, post.status], [200, 'withdrawn', false, 0, 'open']);
    assert.strictEqual(notesTo(HOST._id).length, before + 1);
    assert.strictEqual((await call(ctrl.withdrawRequest, { user: P2, params: { requestId: r2._id } })).code, 409);
    assert.strictEqual((await join(P2, post)).code, 201, 'rút xong thì xin lại được');
    // rút khi còn "chờ": không đổi số chỗ, không báo chủ nhóm
    const n = notesTo(HOST._id).length;
    await call(ctrl.withdrawRequest, { user: P2, params: { requestId: JoinRequest.docs.at(-1)._id } });
    assert.deepStrictEqual([post.acceptedCount, notesTo(HOST._id).length], [0, n]);
});
test('PM-09 · SĐT chỉ lộ cho hai bên SAU KHI được chấp nhận và khi nhóm còn hiệu lực (cả hai chiều, kèm Zalo)', async () => {
    reset();
    const { post } = await newPost({ slotsNeeded: 3 });
    await join(P2, post); await join(P3, post); await join(P4, post);
    const [r2, r3, r4] = JoinRequest.docs;
    await respond(HOST, r2._id, 'accept'); await respond(HOST, r3._id, 'reject');
    // phía chủ nhóm
    let mine = (await call(ctrl.getMyPosts, { user: HOST })).body.posts[0];
    const byUser = Object.fromEntries(mine.requests.map((r) => [r.user.name, r]));
    assert.strictEqual(byUser['Người 2'].contact.phone, P2.phone);
    assert.strictEqual(byUser['Người 2'].contact.zaloUrl, `https://zalo.me/${P2.phone}`);
    assert.ok(!byUser['Người 3'].contact && !byUser['Người 4'].contact);
    assert.ok(!JSON.stringify(byUser['Người 3']).includes(P3.phone) && !JSON.stringify(byUser['Người 4']).includes(P4.phone));
    // phía người xin
    const mine2 = (await call(ctrl.getMyRequests, { user: P2 })).body.requests[0];
    assert.strictEqual(mine2.contact.phone, HOST.phone);
    assert.ok(mine2.contact.zaloUrl.startsWith('https://zalo.me/09'));
    for (const u of [P3, P4]) { const r = (await call(ctrl.getMyRequests, { user: u })).body.requests[0]; assert.ok(!r.contact); assert.ok(!JSON.stringify(r).includes(HOST.phone)); }
    // nhóm đóng → hết lộ
    await call(ctrl.closeMyPost, { user: HOST, params: { id: post._id } });
    mine = (await call(ctrl.getMyPosts, { user: HOST })).body.posts[0];
    assert.ok(mine.requests.every((r) => !r.contact));
    assert.ok(!(await call(ctrl.getMyRequests, { user: P2 })).body.requests[0].contact);
    // người đã rút không còn trong danh sách
    await call(ctrl.withdrawRequest, { user: P4, params: { requestId: r4._id } });
    assert.strictEqual((await call(ctrl.getMyRequests, { user: P4 })).body.requests.length, 0);
});
test('PM-10 · chủ nhóm đóng bài: chỉ chủ nhóm; báo người chờ và người đã được nhận; đóng lại → 409; sau đó không ai xin/duyệt được', async () => {
    reset();
    const { post } = await newPost({ slotsNeeded: 2 });
    await join(P2, post); await join(P3, post);
    await respond(HOST, JoinRequest.docs[0]._id, 'accept');
    assert.strictEqual((await call(ctrl.closeMyPost, { user: P2, params: { id: post._id } })).code, 404);
    assert.strictEqual((await call(ctrl.closeMyPost, { user: HOST, params: { id: post._id } })).code, 200);
    assert.deepStrictEqual([post.status, post.active], ['closed', false]);
    for (const u of [P2, P3]) assert.ok(notesTo(u._id).some((n) => /đã đóng/.test(n.title)), u.name);
    assert.strictEqual((await call(ctrl.closeMyPost, { user: HOST, params: { id: post._id } })).code, 409);
    assert.strictEqual((await join(P4, post)).code, 409);
    assert.strictEqual((await respond(HOST, JoinRequest.docs[1]._id, 'accept')).code, 409);
    const b2 = await addBooking();   // bài mới cho lượt đặt khác vẫn đăng được
    assert.strictEqual((await call(ctrl.createPost, { user: HOST, body: { bookingId: b2._id, slotsNeeded: 1 } })).code, 201);
});
test('PM-11 · closeForBooking: lượt đặt mất hiệu lực thì đóng bài, báo người xin + chủ nhóm, chạy lại không báo trùng, không bao giờ ném lỗi', async () => {
    reset();
    const { post, booking } = await newPost({ slotsNeeded: 2 });
    await join(P2, post);
    await svc.closeForBooking(booking._id, 'lượt đặt đã bị hủy');
    assert.deepStrictEqual([post.status, post.active, post.closedReason], ['closed', false, 'lượt đặt đã bị hủy']);
    assert.ok(notesTo(P2._id).some((n) => /lượt đặt đã bị hủy/.test(n.message)));
    assert.ok(notesTo(HOST._id).some((n) => /tự đóng/.test(n.title) || /tự đóng/.test(n.message)));
    const total = Notification.docs.length;
    await svc.closeForBooking(booking._id, 'lượt đặt đã bị hủy');
    assert.strictEqual(Notification.docs.length, total);
    await svc.closeForBooking(oid(12345), 'không có bài nào');           // không bài → im lặng
    const broken = PlayerPost.findOneAndUpdate; PlayerPost.findOneAndUpdate = async () => { throw new Error('db down'); };
    await svc.closeForBooking(booking._id, 'lỗi giả'); PlayerPost.findOneAndUpdate = broken;
});
test('PM-12 · đã gắn đủ: hook ở hủy đặt (khách + chủ sân) và chuyển sân; route chỉ cho khách hàng; mount ở server', async () => {
    const root = path.join(__dirname, '..');
    const bc = fs.readFileSync(path.join(root, 'controllers', 'bookingController.js'), 'utf8');
    assert.strictEqual((bc.match(/playerService'\)\.closeForBooking\(booking\._id/g) || []).length, 2);
    const ts = fs.readFileSync(path.join(root, 'services', 'transferService.js'), 'utf8');
    assert.ok(/playerService'\)\.closeForBooking\(booking\._id/.test(ts) && ts.indexOf('notifyAllParties(transfer, newBooking)') < ts.indexOf('closeForBooking(booking._id'));
    const rt = fs.readFileSync(path.join(root, 'routes', 'playerRoutes.js'), 'utf8');
    assert.ok(rt.includes("router.use(protect, authorize('customer'))"));
    assert.ok(rt.indexOf("'/mine'") < rt.indexOf("'/:id/join'") && rt.indexOf("'/requests/mine'") < rt.indexOf("'/:id/close'"));
    for (const f of ["'/requests/:requestId/respond', writeLimiter", "'/requests/:requestId/withdraw', writeLimiter", "'/:id/join', writeLimiter", "router.post('/', writeLimiter"]) assert.ok(rt.includes(f), f);
    assert.ok(fs.readFileSync(path.join(root, 'server.js'), 'utf8').includes("'/api/players'"));
});


// ── ĐĂNG THẲNG Ở TRANG TÌM NGƯỜI CHƠI (không cần lượt đặt) ──
const VENUE = oid(60); const COURT = oid(61); const OWNER = oid(70);
async function seedVenue() {
    await Venue.create({ _id: VENUE, ownerId: OWNER, name: 'Sân Hòa Phát', status: 'approved', isActive: true });
    await Court.create({ _id: COURT, venueId: VENUE, name: 'Sân số 3', type: 'badminton', status: 'active' });
}
const direct = (over = {}) => ({ venueId: VENUE, courtId: COURT, date: vnDate(2 * DAY), startTime: '18:00', endTime: '20:00', slotsNeeded: 2, level: 'any', note: 'Đánh vui', ...over });
const postDirect = (body, user = HOST) => call(ctrl.createPost, { user, body });

test('PM-13 · đăng thẳng: kiểm tra đầu vào, địa điểm/sân phải hợp lệ và đang hoạt động, thời gian chưa qua', async () => {
    reset(); await seedVenue();
    assert.strictEqual((await postDirect(direct(), { ...HOST, phone: '' })).code, 400, 'thiếu SĐT');
    assert.strictEqual((await postDirect(direct({ venueId: undefined }))).code, 400, 'thiếu địa điểm');
    assert.strictEqual((await postDirect(direct({ venueId: 'xyz' }))).code, 400);
    assert.strictEqual((await postDirect(direct({ courtId: undefined }))).code, 400, 'thiếu sân');
    for (const date of [undefined, '', 'abc', '2026-02-30', '2026-13-01']) assert.strictEqual((await postDirect(direct({ date }))).code, 400, `ngày ${date}`);
    for (const t of [{ startTime: '25:00' }, { endTime: 'x' }, { startTime: undefined }]) assert.strictEqual((await postDirect(direct(t))).code, 400, JSON.stringify(t));
    for (const t of [{ startTime: '20:00', endTime: '18:00' }, { startTime: '18:00', endTime: '18:00' }]) assert.strictEqual((await postDirect(direct(t))).code, 400, 'giờ kết thúc phải sau giờ bắt đầu');
    for (const n of [0, 21, 1.5, 'x']) assert.strictEqual((await postDirect(direct({ slotsNeeded: n }))).code, 400, `số người ${n}`);
    assert.strictEqual((await postDirect(direct({ level: 'god' }))).code, 400);
    assert.strictEqual((await postDirect(direct({ note: 'x'.repeat(301) }))).code, 400);
    assert.strictEqual((await postDirect(direct({ venueId: oid(999) }))).code, 404, 'địa điểm không tồn tại');
    const other = await Venue.create({ ownerId: OWNER, name: 'Sân khác', status: 'approved', isActive: true });
    assert.strictEqual((await postDirect(direct({ venueId: other._id }))).code, 404, 'sân không thuộc địa điểm đã chọn');
    assert.strictEqual((await postDirect(direct({ courtId: oid(998) }))).code, 404, 'sân không tồn tại');
    assert.strictEqual((await postDirect(direct({ date: vnDate(-DAY) }))).code, 409, 'ngày đã qua');
    assert.strictEqual(PlayerPost.docs.length, 0, 'không bài nào lọt qua');

    Venue.docs.find((v) => v._id === VENUE).status = 'pending';
    assert.strictEqual((await postDirect(direct())).code, 404, 'địa điểm chưa duyệt');
    Venue.docs.find((v) => v._id === VENUE).status = 'approved'; Venue.docs.find((v) => v._id === VENUE).isActive = false;
    assert.strictEqual((await postDirect(direct())).code, 404, 'địa điểm đang ẩn');
    Venue.docs.find((v) => v._id === VENUE).isActive = true; blockedOwners.add(OWNER);
    assert.strictEqual((await postDirect(direct())).code, 404, 'chủ sân bị khoá');
    blockedOwners.clear(); Court.docs.find((c) => c._id === COURT).status = 'maintenance';
    assert.strictEqual((await postDirect(direct())).code, 409, 'sân không hoạt động');
    Court.docs.find((c) => c._id === COURT).status = 'active';
    assert.strictEqual((await postDirect(direct())).code, 201, 'hết lỗi thì đăng được');
});

test('PM-14 · đăng thẳng thành công: lấy tên/môn từ địa điểm + sân, không có bookingId, nhiều bài khác nhau được; trùng sân+giờ bị chặn; trần 5 bài dùng chung', async () => {
    reset(); await seedVenue();
    await Court.create({ _id: oid(62), venueId: VENUE, name: 'Sân số 4', type: 'badminton', status: 'active' });
    const r = await postDirect(direct());
    assert.strictEqual(r.code, 201, JSON.stringify(r.body));
    const p = PlayerPost.docs.find((x) => x._id === r.body.post._id);
    assert.deepStrictEqual([p.source, p.venueName, p.courtName, p.sport, p.hostId, p.slotsNeeded, p.level, p.note], ['direct', 'Sân Hòa Phát', 'Sân số 3', 'badminton', HOST._id, 2, 'any', 'Đánh vui']);
    assert.strictEqual(p.bookingId, undefined, 'bài đăng thẳng không có bookingId');
    assert.strictEqual(p.courtId, COURT);
    assert.strictEqual(p.startsAt.toISOString(), new Date(`${p.date}T18:00:00+07:00`).toISOString(), 'giờ theo giờ Việt Nam');
    assert.strictEqual(Booking.docs.length, 0, 'không cần tạo lượt đặt nào');

    assert.strictEqual((await postDirect(direct())).code, 409, 'cùng sân + cùng giờ bắt đầu → trùng');
    assert.strictEqual((await postDirect(direct({ courtId: oid(62) }))).code, 201, 'sân khác được (hai bài không bookingId không đụng nhau)');
    assert.strictEqual((await postDirect(direct({ startTime: '20:00', endTime: '21:00' }))).code, 201, 'giờ khác được');
    assert.strictEqual((await postDirect(direct(), P2)).code, 201, 'người khác đăng cùng sân + giờ vẫn được');

    // trần 5 bài chưa diễn ra tính chung cả hai kiểu: đã có 3 bài direct của HOST → thêm 1 bài từ lượt đặt + 1 direct = 5, bài thứ 6 bị chặn
    const b = await addBooking();
    assert.strictEqual((await call(ctrl.createPost, { user: HOST, body: { bookingId: b._id, slotsNeeded: 1 } })).code, 201);
    assert.strictEqual((await postDirect(direct({ startTime: '10:00', endTime: '11:00' }))).code, 201);
    assert.strictEqual((await postDirect(direct({ startTime: '12:00', endTime: '13:00' }))).code, 429, 'bài thứ 6');
});

test('PM-15 · cách đăng cũ (từ lượt đặt) vẫn y nguyên: source=booking, có bookingId, mỗi lượt đặt một bài', async () => {
    reset(); await seedVenue();
    const { post, booking } = await newPost();
    assert.deepStrictEqual([post.source, String(post.bookingId)], ['booking', String(booking._id)]);
    const again = await call(ctrl.createPost, { user: HOST, body: { bookingId: booking._id, slotsNeeded: 2 } });
    assert.strictEqual(again.code, 409);
    // bookingId rỗng + không có venue/court → đi nhánh đăng thẳng và bị chặn đúng lý do, không lỗi 500
    const none = await call(ctrl.createPost, { user: HOST, body: { slotsNeeded: 2 } });
    assert.strictEqual(none.code, 400);
    assert.strictEqual((await call(ctrl.createPost, { user: HOST, body: { bookingId: 'xyz', slotsNeeded: 2 } })).code, 400);
});

test('PM-16 · bài đăng thẳng: hiện trong danh sách (kèm source), lọc theo môn/ngày, KHÔNG lộ SĐT; xin → nhận → đầy người; hiện liên hệ sau khi được nhận', async () => {
    reset(); await seedVenue();
    const r = await postDirect(direct({ slotsNeeded: 1 }));
    const post = PlayerPost.docs.find((x) => x._id === r.body.post._id);

    const list = await call(ctrl.listPosts, { user: P2, query: {} });
    assert.strictEqual(list.body.posts.length, 1, 'không cần lượt đặt vẫn hiện');
    assert.strictEqual(list.body.posts[0].source, 'direct');
    assert.strictEqual(list.body.posts[0].venueName, 'Sân Hòa Phát');
    assert.ok(!JSON.stringify(list.body).includes(HOST.phone), 'không lộ SĐT chủ nhóm');
    assert.strictEqual((await call(ctrl.listPosts, { user: P2, query: { sport: 'badminton' } })).body.posts.length, 1);
    assert.strictEqual((await call(ctrl.listPosts, { user: P2, query: { sport: 'football' } })).body.posts.length, 0);
    assert.strictEqual((await call(ctrl.listPosts, { user: P2, query: { date: post.date } })).body.posts.length, 1);
    assert.strictEqual((await call(ctrl.listPosts, { user: HOST, query: {} })).body.posts[0].isMine, true);

    const j = await join(P2, post, 'Mình chơi khá');
    assert.strictEqual(j.code, 201, JSON.stringify(j.body));
    assert.strictEqual(notesTo(HOST._id).length, 1, 'chủ nhóm được báo');
    const mine = await call(ctrl.getMyPosts, { user: HOST });
    assert.ok(!('contact' in mine.body.posts[0].requests[0]), 'chưa nhận thì chưa có liên hệ');

    const ok = await respond(HOST, j.body.request._id, 'accept');
    assert.strictEqual(ok.code, 200, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.contact.phone, P2.phone);
    assert.strictEqual(post.status, 'full', 'đủ người');
    assert.strictEqual((await join(P3, post)).code, 409, 'đã đủ người');
    const reqs = await call(ctrl.getMyRequests, { user: P2 });
    assert.strictEqual(reqs.body.requests[0].contact.phone, HOST.phone, 'người được nhận thấy liên hệ chủ nhóm');
});

test('PM-17 · bài đăng thẳng: chủ nhóm đóng được, hết giờ thì không xin được, closeForBooking không đụng tới', async () => {
    reset(); await seedVenue();
    const r = await postDirect(direct());
    const post = PlayerPost.docs.find((x) => x._id === r.body.post._id);
    const j = await join(P2, post);
    await svc.closeForBooking(oid(12345), 'lượt đặt bất kỳ');
    assert.strictEqual(post.status, 'open', 'bài không gắn lượt đặt thì hook hủy đặt không đóng nhầm');

    post.startsAt = new Date(Date.now() - H);
    assert.strictEqual((await join(P3, post)).code, 409, 'đã bắt đầu');
    assert.strictEqual((await respond(HOST, j.body.request._id, 'accept')).code, 409, 'đã bắt đầu thì không nhận thêm');
    post.startsAt = new Date(Date.now() + DAY);

    assert.strictEqual((await call(ctrl.closeMyPost, { user: P2, params: { id: post._id } })).code, 404, 'người khác không đóng được');
    assert.strictEqual((await call(ctrl.closeMyPost, { user: HOST, params: { id: post._id } })).code, 200);
    assert.deepStrictEqual([post.status, post.active], ['closed', false]);
    assert.strictEqual((await join(P3, post)).code, 409, 'đóng rồi không xin được');
    // đóng rồi thì đăng lại cùng sân + giờ được
    assert.strictEqual((await postDirect(direct())).code, 201);
});

test('PM-18 · schema THẬT: bài không có bookingId hợp lệ; chỉ mục duy nhất bỏ qua bài thiếu bookingId; source sai bị từ chối; có rebuildIndexes (không ghi đè ensureIndexes của Mongoose); đã gắn migrate + server', async () => {
    const { execFileSync } = require('child_process');
    const root = path.join(__dirname, '..');
    const out = execFileSync(process.execPath, ['-e', `
        const M = require('./models/PlayerPost');
        const base = { hostId: '${oid(1)}', venueId: '${oid(60)}', date: '2030-01-01', startTime: '18:00', endTime: '19:00', startsAt: new Date(), slotsNeeded: 2 };
        const idx = M.schema.indexes().find(([k]) => k.bookingId === 1);
        console.log(JSON.stringify({
            directOk: !new M({ ...base, source: 'direct', courtId: '${oid(61)}' }).validateSync(),
            defaultSource: new M({ ...base, bookingId: '${oid(5)}' }).source,
            badSource: !!new M({ ...base, source: 'x' }).validateSync(),
            unique: idx[1].unique, partial: idx[1].partialFilterExpression,
            hasEnsure: typeof M.rebuildIndexes === 'function',
        }));`], { cwd: root, encoding: 'utf8' });
    const r = JSON.parse(out.trim().split('\n').pop());
    assert.deepStrictEqual([r.directOk, r.defaultSource, r.badSource, r.unique, r.hasEnsure], [true, 'booking', true, true, true]);
    assert.deepStrictEqual(r.partial, { active: true, bookingId: { $type: 'objectId' } }, 'chỉ tính bài có bookingId kiểu ObjectId');
    assert.ok(fs.readFileSync(path.join(root, 'scripts', 'migrate.js'), 'utf8').includes('rebuildIndexes()'), 'migrate dựng lại chỉ mục');
    assert.ok(/PlayerPost'\)\.rebuildIndexes\(\)/.test(fs.readFileSync(path.join(root, 'server.js'), 'utf8')), 'server tự sửa chỉ mục khi kết nối');
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
