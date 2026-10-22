/**
 * KIỂM THỬ MẠNG LƯỚI CHUYỂN SÂN (#60): chủ sân xin tham gia → Admin duyệt/từ chối/gỡ → chặn chuyển sang chủ sân khác
 * (loại T4) khi một bên chưa là thành viên. Model thay bằng bản giả trong bộ nhớ (không cần MongoDB).
 * Khoá chặt: mặc định TẮT thì hành vi cũ không đổi; chỉ T4 bị ràng buộc; cập nhật có điều kiện chống chạy đua;
 * chủ sân cũ chưa có trường transferNetwork vẫn hoạt động; không lộ trường nhạy cảm.
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

let seq = 7000;
const getPath = (d, k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), d);
const setPath = (d, k, v) => { const parts = k.split('.'); let o = d; parts.slice(0, -1).forEach((p) => { if (o[p] == null) o[p] = {}; o = o[p]; }); o[parts.at(-1)] = v; };
function match(doc, filter = {}) {
    return Object.entries(filter).every(([k, cond]) => {
        if (k === '$or') return cond.some((f) => match(doc, f));
        if (k === '$and') return cond.every((f) => match(doc, f));
        const v = getPath(doc, k);
        if (cond instanceof RegExp) return cond.test(String(v ?? ''));
        if (cond === null) return v == null;
        if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('$exists' in cond) return cond.$exists ? v !== undefined : v === undefined;
            if ('$in' in cond) return cond.$in.map(String).includes(String(v));
            if ('$ne' in cond) return String(v) !== String(cond.$ne);
        }
        return String(v) === String(cond);
    });
}
const thenable = (get, extra = {}) => { const self = { then: (a, b) => Promise.resolve(get()).then(a, b), catch: (b) => Promise.resolve(get()).catch(b), select: () => self, ...extra }; return self; };
const User = { docs: [] };
const decorate = (d) => { const doc = { ...d }; doc.toObject = () => JSON.parse(JSON.stringify(doc)); return doc; };
User.findById = (id) => thenable(() => User.docs.find((d) => d._id === id) || null);
User.findOne = (f) => thenable(() => User.docs.find((d) => match(d, f)) || null);
User.countDocuments = async (f) => User.docs.filter((d) => match(d, f)).length;
User.find = (f) => {
    let sortSpec = null; let skip = 0; let lim = Infinity;
    const run = () => {
        let rows = User.docs.filter((d) => match(d, f));
        if (sortSpec) { const [k, dir] = Object.entries(sortSpec)[0]; rows = [...rows].sort((a, b) => { const x = getPath(a, k); const y = getPath(b, k); return (x > y ? 1 : x < y ? -1 : 0) * dir; }); }
        return rows.slice(skip, skip + lim);
    };
    const self = thenable(run, { sort: (o) => { sortSpec = o; return self; }, skip: (n) => { skip = n; return self; }, limit: (n) => { lim = n; return self; } });
    return self;
};
User.findOneAndUpdate = async (f, update) => {
    const d = User.docs.find((x) => match(x, f));
    if (!d) return null;
    Object.entries(update).forEach(([k, v]) => setPath(d, k, v));
    return d;
};
const Notification = { docs: [], create: async (n) => { Notification.docs.push(n); return n; } };
let settings = { transferNetworkRequired: false };
fake('models/User.js', User); fake('models/Notification.js', Notification);
fake('utils/platformSettings.js', { getSettings: async () => settings });
const net = require('../utils/transferNetwork');
const ctrl = require('../controllers/networkController');

const call = (handler, req) => new Promise((ok, bad) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; ok(this); return this; } };
    handler({ body: {}, params: {}, query: {}, ...req }, res, (e) => bad(e));
});
const ADMIN = { _id: oid(1), role: 'admin', name: 'Admin' };
function owner(n, status, extra = {}) {
    const d = { _id: oid(n), name: `Chủ sân ${n}`, email: `owner${n}@x.vn`, phone: `09000000${n}`, role: 'owner', password: 'HASH-KHONG-DUOC-LO', createdAt: new Date(2026, 0, n), ...extra };
    if (status !== undefined) d.transferNetwork = { status, requestedAt: status === 'pending' ? new Date(2026, 5, n) : null, reviewedAt: null, note: '' };
    return decorate(d);
}
function reset(required = false) {
    settings = { transferNetworkRequired: required };
    User.docs = [decorate({ _id: ADMIN._id, name: 'Admin', role: 'admin', status: 'active' }), decorate({ _id: oid(2), name: 'Admin bị khóa', role: 'admin', status: 'banned' })];
    Notification.docs = [];
}
const notesTo = (id) => Notification.docs.filter((n) => n.userId === id);

console.log('\n=== MẠNG LƯỚI CHUYỂN SÂN ===\n');
test('NW-01 · mặc định TẮT: mọi chủ sân tính là thành viên, không chặn gì (hành vi cũ giữ nguyên)', async () => {
    reset(false);
    User.docs.push(owner(10, 'none'), owner(11));
    assert.strictEqual(await net.ownerInNetwork(oid(10), settings), true);
    assert.strictEqual(await net.ownerInNetwork(oid(11), settings), true);
    assert.strictEqual(await net.crossOwnerBlocker({ type: 'T4', fromOwnerId: oid(10), toOwnerId: oid(11), settings }), null);
});
test('NW-02 · BẬT: chỉ T4 bị ràng buộc và cần CẢ HAI bên đã duyệt; T1/T2/T3/T5 không bao giờ bị chặn; thiếu trường/trạng thái khác → không phải thành viên', async () => {
    reset(true);
    User.docs.push(owner(10, 'approved'), owner(11, 'approved'), owner(12, 'pending'), owner(13, 'revoked'), owner(14, 'rejected'), owner(15));
    const block = (type, from, to) => net.crossOwnerBlocker({ type, fromOwnerId: oid(from), toOwnerId: oid(to), settings });
    assert.strictEqual(await block('T4', 10, 11), null);
    assert.match(await block('T4', 12, 11), /hiện tại/);
    assert.match(await block('T4', 10, 13), /địa điểm này/);
    for (const to of [12, 13, 14, 15]) assert.ok(await block('T4', 10, to), `đích ${to}`);
    assert.ok(await block('T4', 15, 10), 'chủ sân cũ chưa có trường transferNetwork = chưa phải thành viên');
    for (const type of ['T1', 'T2', 'T3', 'T5']) assert.strictEqual(await block(type, 15, 12), null, type);
    assert.strictEqual(await net.ownerInNetwork(undefined, settings), false);
    assert.strictEqual(await net.ownerInNetwork(oid(999), settings), false);
});
test('NW-03 · chủ sân xin tham gia: báo admin (không báo admin bị khóa); đã chờ/đã duyệt/bị gỡ → 409; bị từ chối thì xin lại được; chủ sân cũ chưa có trường vẫn xin được', async () => {
    reset(true);
    User.docs.push(owner(10, 'none'), owner(11), owner(12, 'pending'), owner(13, 'approved'), owner(14, 'revoked'), owner(15, 'rejected'));
    const r = await call(ctrl.requestToJoin, { user: { _id: oid(10) } });
    assert.deepStrictEqual([r.code, r.body.status], [201, 'pending']);
    assert.ok(User.docs.find((d) => d._id === oid(10)).transferNetwork.requestedAt instanceof Date);
    assert.deepStrictEqual([notesTo(ADMIN._id).length, notesTo(oid(2)).length], [1, 0]);
    assert.strictEqual((await call(ctrl.requestToJoin, { user: { _id: oid(11) } })).code, 201, 'chủ sân cũ chưa có trường');
    for (const id of [12, 13, 14]) assert.strictEqual((await call(ctrl.requestToJoin, { user: { _id: oid(id) } })).code, 409, `owner ${id}`);
    assert.strictEqual((await call(ctrl.requestToJoin, { user: { _id: oid(15) } })).code, 201);
});
test('NW-04 · bấm xin hai lần cùng lúc: chỉ một yêu cầu thành công, admin chỉ nhận một thông báo', async () => {
    reset(true);
    User.docs.push(owner(10, 'none'));
    const before = Notification.docs.length;
    const [a, b] = await Promise.all([call(ctrl.requestToJoin, { user: { _id: oid(10) } }), call(ctrl.requestToJoin, { user: { _id: oid(10) } })]);
    assert.deepStrictEqual([a.code, b.code].sort(), [201, 409]);
    assert.strictEqual(Notification.docs.length - before, 1);
});
test('NW-05 · danh sách của admin: lọc theo trạng thái ("none" gồm cả chủ sân cũ chưa có trường), tìm theo tên/email, phân trang, thống kê, cờ bắt buộc, KHÔNG lộ mật khẩu', async () => {
    reset(true);
    User.docs.push(owner(10, 'pending'), owner(11, 'pending'), owner(12, 'approved'), owner(13), owner(14, 'none'), owner(15, 'rejected'), owner(16, 'revoked'));
    const list = (query) => call(ctrl.listOwners, { query });
    const pending = await list({ status: 'pending' });
    assert.deepStrictEqual(pending.body.owners.map((o) => o.name).sort(), ['Chủ sân 10', 'Chủ sân 11']);
    assert.strictEqual((await list({ status: 'none' })).body.owners.length, 2);
    assert.deepStrictEqual((await list({ search: 'OWNER12@' })).body.owners.map((o) => o.name), ['Chủ sân 12']);
    const page = await list({ limit: 3, page: 2 });
    assert.deepStrictEqual([page.body.owners.length, page.body.total, page.body.totalPages], [3, 7, 3]);
    const all = await list({});
    assert.deepStrictEqual(all.body.stats, { none: 2, pending: 2, approved: 1, rejected: 1, revoked: 1, total: 7 });
    assert.strictEqual(all.body.required, true);
    assert.ok(!/HASH-KHONG-DUOC-LO|password/.test(JSON.stringify(all.body)));
    assert.ok(!all.body.owners.some((o) => o.role === 'admin') && all.body.total === 7, 'chỉ liệt kê chủ sân');
});
test('NW-06 · duyệt: từ chờ/chưa tham gia/bị từ chối/bị gỡ đều được; ghi người duyệt + giờ; báo chủ sân; đã duyệt rồi → 409', async () => {
    reset(true);
    User.docs.push(owner(10, 'pending'), owner(11, 'none'), owner(12, 'rejected'), owner(13, 'revoked'), owner(14, 'approved'), owner(15));
    for (const id of [10, 11, 12, 13, 15]) {
        const r = await call(ctrl.reviewOwner, { user: ADMIN, params: { ownerId: oid(id) }, body: { action: 'approve' } });
        assert.strictEqual(r.code, 200, `owner ${id}`);
        const d = User.docs.find((x) => x._id === oid(id));
        assert.deepStrictEqual([d.transferNetwork.status, d.transferNetwork.reviewedBy], ['approved', ADMIN._id]);
        assert.ok(d.transferNetwork.reviewedAt instanceof Date);
        assert.ok(notesTo(oid(id)).some((n) => /được duyệt/.test(n.title)));
    }
    assert.strictEqual((await call(ctrl.reviewOwner, { user: ADMIN, params: { ownerId: oid(14) }, body: { action: 'approve' } })).code, 409);
});
test('NW-07 · từ chối chỉ với yêu cầu đang chờ và cần lý do; gỡ chỉ với thành viên và cần lý do; đầu vào sai → 400/404', async () => {
    reset(true);
    User.docs.push(owner(10, 'pending'), owner(11, 'approved'), owner(12, 'none'), decorate({ _id: oid(20), name: 'Khách', role: 'customer' }));
    const act = (id, body) => call(ctrl.reviewOwner, { user: ADMIN, params: { ownerId: oid(id) }, body });
    assert.strictEqual((await act(10, { action: 'reject', reason: 'ừ' })).code, 400);
    assert.strictEqual((await act(10, { action: 'reject', reason: 'x'.repeat(501) })).code, 400);
    assert.strictEqual((await act(11, { action: 'reject', reason: 'Không phải yêu cầu chờ' })).code, 409);
    assert.strictEqual((await act(12, { action: 'reject', reason: 'Chưa từng xin vào' })).code, 409);
    const rej = await act(10, { action: 'reject', reason: 'Thiếu giấy phép kinh doanh hợp lệ' });
    assert.deepStrictEqual([rej.code, User.docs.find((d) => d._id === oid(10)).transferNetwork.note], [200, 'Thiếu giấy phép kinh doanh hợp lệ']);
    assert.ok(notesTo(oid(10)).some((n) => /Thiếu giấy phép/.test(n.message)));
    assert.strictEqual((await act(11, { action: 'revoke', reason: '' })).code, 400);
    assert.strictEqual((await act(12, { action: 'revoke', reason: 'Chưa là thành viên' })).code, 409);
    assert.strictEqual((await act(11, { action: 'revoke', reason: 'Nhiều lần hủy kèo của khách' })).code, 200);
    assert.strictEqual(User.docs.find((d) => d._id === oid(11)).transferNetwork.status, 'revoked');
    assert.strictEqual((await act(20, { action: 'approve' })).code, 404, 'khách hàng không phải chủ sân');
    assert.strictEqual((await act(999, { action: 'approve' })).code, 404);
    assert.strictEqual((await act(10, { action: 'xoa' })).code, 400);
    assert.strictEqual((await call(ctrl.reviewOwner, { user: ADMIN, params: { ownerId: 'xyz' }, body: { action: 'approve' } })).code, 400);
});
test('NW-08 · duyệt tất cả đang chờ: chỉ người đang chờ được duyệt, trả về số lượng, báo từng người; chạy lại không duyệt trùng', async () => {
    reset(true);
    User.docs.push(owner(10, 'pending'), owner(11, 'pending'), owner(12, 'rejected'), owner(13, 'none'), owner(14, 'approved'));
    const r = await call(ctrl.approveAllPending, { user: ADMIN });
    assert.deepStrictEqual([r.code, r.body.approved], [200, 2]);
    assert.deepStrictEqual(User.docs.filter((d) => d.transferNetwork?.status === 'approved').map((d) => d._id).sort(), [oid(10), oid(11), oid(14)]);
    assert.strictEqual(User.docs.find((d) => d._id === oid(12)).transferNetwork.status, 'rejected');
    assert.deepStrictEqual([notesTo(oid(10)).length, notesTo(oid(11)).length, notesTo(oid(14)).length], [1, 1, 0]);
    assert.strictEqual((await call(ctrl.approveAllPending, { user: ADMIN })).body.approved, 0);
});
test('NW-09 · chủ sân xem trạng thái của mình (chủ sân cũ chưa có trường = none) kèm cờ bắt buộc', async () => {
    reset(true);
    User.docs.push(owner(10, 'approved'), owner(11));
    const a = await call(ctrl.getMyNetwork, { user: { _id: oid(10) } });
    assert.deepStrictEqual([a.body.required, a.body.status], [true, 'approved']);
    assert.strictEqual((await call(ctrl.getMyNetwork, { user: { _id: oid(11) } })).body.status, 'none');
    settings.transferNetworkRequired = false;
    assert.strictEqual((await call(ctrl.getMyNetwork, { user: { _id: oid(10) } })).body.required, false);
});
test('NW-10 · đã gắn đủ: kiểm tra ở báo giá + xác nhận + sau duyệt (chỉ T4), eligibility trả `network`, route đúng quyền, cài đặt & model có trường', async () => {
    const root = path.join(__dirname, '..');
    const ts = fs.readFileSync(path.join(root, 'services', 'transferService.js'), 'utf8');
    assert.strictEqual((ts.match(/crossOwnerBlocker\(/g) || []).length, 3);
    assert.ok(ts.indexOf('crossOwnerBlocker') < ts.indexOf('await getCommissionConfig()'), 'kiểm tra trước khi tính giá/giữ chỗ');
    assert.ok(ts.indexOf('async function proceedAfterApproval') < ts.lastIndexOf('crossOwnerBlocker(') && ts.lastIndexOf('crossOwnerBlocker(') < ts.indexOf('transfer.quote.settlement > 0'), 'kiểm tra lại trước khi thu tiền');
    assert.ok(fs.readFileSync(path.join(root, 'controllers', 'transferController.js'), 'utf8').includes('network,'));
    const owner = fs.readFileSync(path.join(root, 'routes', 'ownerRoutes.js'), 'utf8');
    assert.ok(owner.indexOf("router.use(protect, authorize('owner'))") < owner.indexOf("router.get('/network'") && owner.includes("'/network/request', writeLimiter"));
    const admin = fs.readFileSync(path.join(root, 'routes', 'adminRoutes.js'), 'utf8');
    const gate = admin.indexOf("router.use(protect, authorize('admin'))");
    for (const f of ["router.get('/network'", "'/network/approve-pending', writeLimiter", "'/network/:ownerId', writeLimiter"]) assert.ok(admin.indexOf(f) > gate, f);
    assert.ok(fs.readFileSync(path.join(root, 'controllers', 'settingsController.js'), 'utf8').includes('transferNetworkRequired'));
    assert.ok(/transferNetworkRequired: \{ type: Boolean, default: false \}/.test(fs.readFileSync(path.join(root, 'models', 'PlatformSetting.js'), 'utf8')));
    assert.ok(fs.readFileSync(path.join(root, 'models', 'User.js'), 'utf8').includes('transferNetwork: {'));
});

test('NW-11 · admin MỜI chủ sân chưa tham gia: chỉ khi status none, gửi thông báo cho chủ sân, không đổi trạng thái, giãn cách 24h', async () => {
    reset();
    User.docs.push(owner(10, 'none'), owner(11), owner(12, 'pending'), owner(13, 'approved'), owner(14, 'rejected'), decorate({ _id: oid(20), name: 'Khách', role: 'customer' }));
    const invite = (id) => call(ctrl.inviteOwner, { user: ADMIN, params: { ownerId: id } });
    for (const n of [10, 11]) {
        const r = await invite(oid(n));
        assert.strictEqual(r.code, 200, `chủ sân ${n}`);
        assert.ok(User.docs.find((d) => d._id === oid(n)).transferNetwork.invitedAt, 'ghi lại thời điểm mời');
        assert.strictEqual(User.docs.find((d) => d._id === oid(n)).transferNetwork.status || 'none', 'none', 'mời KHÔNG tự duyệt');
        assert.strictEqual(notesTo(oid(n)).length, 1);
        assert.strictEqual(notesTo(oid(n))[0].link, '/owner/transfers');
    }
    assert.strictEqual((await invite(oid(10))).code, 409, 'vừa mời xong chưa được mời lại');
    for (const n of [12, 13, 14]) assert.strictEqual((await invite(oid(n))).code, 409, `status khác none (${n}) không được mời`);
    assert.strictEqual((await invite(oid(20))).code, 404, 'khách hàng không phải chủ sân');
    assert.strictEqual((await invite('xyz')).code, 400);
});
test('NW-12 · chủ sân trả lời lời mời: đồng ý → thành viên + báo admin; từ chối → chỉ xoá lời mời; không có lời mời → 409', async () => {
    reset();
    User.docs.push(owner(10, 'none'), owner(11, 'none'), owner(12, 'none'));
    await call(ctrl.inviteOwner, { user: ADMIN, params: { ownerId: oid(10) } });
    await call(ctrl.inviteOwner, { user: ADMIN, params: { ownerId: oid(11) } });
    Notification.docs = [];
    const respond = (id, accept) => call(ctrl.respondToInvite, { user: { _id: oid(id) }, body: { accept } });

    const ok = await respond(10, true);
    assert.deepStrictEqual([ok.code, ok.body.status, ok.body.invitedAt], [200, 'approved', null]);
    assert.strictEqual(notesTo(ADMIN._id).length, 1, 'admin được báo');
    assert.strictEqual(notesTo(oid(2)).length, 0, 'admin bị khóa không nhận');
    assert.strictEqual((await respond(10, true)).code, 409, 'trả lời lần hai bị chặn');

    const no = await respond(11, false);
    assert.deepStrictEqual([no.code, no.body.status, no.body.invitedAt], [200, 'none', null]);
    assert.strictEqual((await respond(11, true)).code, 409, 'đã từ chối thì lời mời hết hiệu lực');

    assert.strictEqual((await respond(12, true)).code, 409, 'chưa được mời thì không tự duyệt bằng cách này');
    assert.strictEqual(User.docs.find((d) => d._id === oid(12)).transferNetwork.status, 'none');
});
test('NW-13 · chủ sân tự xin tham gia thì lời mời cũ bị xoá; route + model đã gắn đủ', async () => {
    reset();
    User.docs.push(owner(10, 'none'));
    await call(ctrl.inviteOwner, { user: ADMIN, params: { ownerId: oid(10) } });
    const r = await call(ctrl.requestToJoin, { user: { _id: oid(10) } });
    assert.deepStrictEqual([r.code, r.body.status, r.body.invitedAt], [201, 'pending', null]);
    const root = path.join(__dirname, '..');
    assert.ok(fs.readFileSync(path.join(root, 'routes', 'ownerRoutes.js'), 'utf8').includes("'/network/respond', writeLimiter"));
    const admin = fs.readFileSync(path.join(root, 'routes', 'adminRoutes.js'), 'utf8');
    assert.ok(admin.indexOf("'/network/:ownerId/invite', writeLimiter") > admin.indexOf("router.use(protect, authorize('admin'))"));
    assert.ok(fs.readFileSync(path.join(root, 'models', 'User.js'), 'utf8').includes('invitedAt: { type: Date, default: null }'));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
