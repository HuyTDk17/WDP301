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
const PlayerPost = makeModel({ status: 'open', active: true, acceptedCount: 0, level: 'any', note: '' }, [{ fields: ['bookingId'], when: (d) => d.active === true }]);
const JoinRequest = makeModel({ status: 'pending', active: true, message: '' }, [{ fields: ['postId', 'userId'], when: (d) => d.active === true }]);
const Booking = makeModel(); const User = makeModel(); const Notification = makeModel();
fake('models/PlayerPost.js', PlayerPost); fake('models/JoinRequest.js', JoinRequest);
fake('models/Booking.js', Booking); fake('models/User.js', User); fake('models/Notification.js', Notification);
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
    for (const M of [PlayerPost, JoinRequest, Booking, User, Notification]) M.docs = [];
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

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
