/**
 * KIỂM THỬ SỰ KIỆN CỦA CHỦ SÂN (giải đấu / khuyến mãi): tạo, sửa, hủy, danh sách công khai.
 * Model thay bằng bản giả trong bộ nhớ (không cần MongoDB). Khoá chặt: chỉ chủ sân của địa điểm mới tạo/sửa/hủy được,
 * kiểm tra thời gian chặt chẽ, sự kiện đã hủy/kết thúc không sửa được, và công khai không lộ sự kiện ở địa điểm bị ẩn.
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

let seq = 5000;
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
function chain(getRows, log) {
    let sortSpec = null; let skip = 0; let lim = Infinity;
    const run = () => {
        let rows = getRows();
        if (sortSpec) { const [k, dir] = Object.entries(sortSpec)[0]; rows = [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir); }
        return rows.slice(skip, skip + lim);
    };
    const self = {
        then: (a, b) => Promise.resolve(run()).then(a, b), catch: (b) => Promise.resolve(run()).catch(b),
        populate: () => self, sort: (o) => { sortSpec = o; return self; }, skip: (n) => { skip = n; return self; },
        limit: (n) => { lim = n; return self; }, select: (s) => { if (log) log.select = s; return self; },
    };
    return self;
}
function makeModel(defaults = {}) {
    const M = { docs: [], log: {} };
    const decorate = (d) => {
        const doc = { ...defaults, ...d };
        doc.save = async () => doc;
        doc.toObject = () => ({ ...doc, save: undefined, toObject: undefined });
        return doc;
    };
    M.create = async (d) => { const doc = decorate({ _id: oid(++seq), ...d }); M.docs.push(doc); return doc; };
    M.countDocuments = async (f) => M.docs.filter((d) => match(d, f)).length;
    M.find = (f) => chain(() => M.docs.filter((d) => match(d, f)), M.log);
    M.findOne = (f) => chain(() => { const r = M.docs.find((d) => match(d, f)); return r ? [r] : []; }).then ? { then: (a, b) => Promise.resolve(M.docs.find((d) => match(d, f)) || null).then(a, b) } : null;
    M.findById = (id) => { const self = { then: (a, b) => Promise.resolve(M.docs.find((d) => d._id === id) || null).then(a, b), populate: () => self, select: (s) => { M.log.select = s; return self; } }; return self; };
    M.distinct = async (field, f) => M.docs.filter((d) => match(d, f)).map((d) => d[field]);
    return M;
}
const Event = makeModel({ status: 'scheduled', type: 'other', highlight: '', price: 0, imageUrl: '', cancelReason: '', cancelledAt: null });
const Venue = makeModel({ status: 'approved', isActive: true });
const removed = []; let blockedOwners = [];
fake('models/Event.js', Event); fake('models/Venue.js', Venue);
fake('services/settlementService.js', { blockedOwnerIds: async () => blockedOwners });
fake('utils/uploads.js', { fileUrl: (f) => f.url, removeStoredFile: (u) => removed.push(u) });
const ctrl = require('../controllers/eventController');

const call = (handler, req) => new Promise((ok, bad) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; ok(this); return this; } };
    handler({ body: {}, params: {}, query: {}, ...req }, res, (e) => bad(e));
});
const OWNER = { _id: oid(1), role: 'owner' };
const OWNER2 = { _id: oid(2), role: 'owner' };
const V1 = oid(10); const V2 = oid(11); const V3 = oid(12);
const H = 3600000; const DAY = 24 * H;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const good = (extra = {}) => ({ venueId: V1, title: 'Giải bóng đá mùa thu', description: 'Giải đấu giao hữu dành cho các đội phong trào quanh khu vực.', type: 'tournament', startsAt: iso(2 * DAY), endsAt: iso(2 * DAY + 4 * H), ...extra });
function seed() {
    Event.docs = []; Event.log = {}; Venue.docs = []; removed.length = 0; blockedOwners = [];
    Venue.docs.push(
        { _id: V1, name: 'Sân Mỹ Đình', ownerId: OWNER._id, status: 'approved', isActive: true },
        { _id: V2, name: 'Sân Cầu Giấy', ownerId: OWNER._id, status: 'approved', isActive: true },
        { _id: V3, name: 'Sân của người khác', ownerId: OWNER2._id, status: 'approved', isActive: true },
    );
}
async function add(over) { return Event.create({ ownerId: OWNER._id, venueId: V1, venueName: 'Sân Mỹ Đình', title: 'Sự kiện mẫu', description: 'Mô tả sự kiện đủ dài để hợp lệ.', startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + DAY + 2 * H), ...over }); }

console.log('\n=== SỰ KIỆN ===\n');
test('EV-01 · tạo sự kiện: lưu tên địa điểm, ảnh, trạng thái upcoming; địa điểm của chủ sân khác → 404', async () => {
    seed();
    const r = await call(ctrl.createEvent, { user: OWNER, body: good({ highlight: ' Giảm 20% ', price: '50000' }), file: { url: '/uploads/e.jpg' } });
    assert.strictEqual(r.code, 201);
    assert.deepStrictEqual([r.body.event.venueName, r.body.event.imageUrl, r.body.event.phase, r.body.event.highlight, r.body.event.price], ['Sân Mỹ Đình', '/uploads/e.jpg', 'upcoming', 'Giảm 20%', 50000]);
    const other = await call(ctrl.createEvent, { user: OWNER, body: good({ venueId: V3 }), file: { url: '/uploads/x.jpg' } });
    assert.strictEqual(other.code, 404);
    assert.ok(removed.includes('/uploads/x.jpg'));
    assert.strictEqual(Event.docs.length, 1);
});
test('EV-02 · kiểm tra đầu vào: tên/mô tả, thời gian, loại, phí; lỗi thì xóa ảnh vừa tải lên', async () => {
    seed();
    const bad = {
        'tên ngắn': { title: 'abc' }, 'mô tả ngắn': { description: 'ngắn' }, 'thiếu giờ': { startsAt: undefined },
        'kết thúc trước bắt đầu': { endsAt: iso(DAY) }, 'quá 90 ngày': { endsAt: iso(2 * DAY + 91 * DAY) },
        'bắt đầu ở quá khứ': { startsAt: iso(-H), endsAt: iso(H) }, 'quá 1 năm': { startsAt: iso(400 * DAY), endsAt: iso(401 * DAY) },
        'loại lạ': { type: 'hack' }, 'phí âm': { price: '-5' }, 'phí lẻ': { price: '10.5' }, 'ngày sai': { startsAt: 'không phải ngày' },
        'nổi bật quá dài': { highlight: 'x'.repeat(61) },
    };
    for (const [name, patch] of Object.entries(bad)) {
        removed.length = 0;
        const r = await call(ctrl.createEvent, { user: OWNER, body: good(patch), file: { url: '/uploads/o.jpg' } });
        assert.strictEqual(r.code, 400, name);
        assert.deepStrictEqual(removed, ['/uploads/o.jpg'], `${name}: phải xóa ảnh mồ côi`);
    }
    assert.strictEqual((await call(ctrl.createEvent, { user: OWNER, body: good({ venueId: 'xyz' }) })).code, 400);
    assert.strictEqual(Event.docs.length, 0);
});
test('EV-03 · tối đa 20 sự kiện chưa kết thúc mỗi chủ sân (sự kiện đã hủy/đã kết thúc không tính)', async () => {
    seed();
    for (let i = 0; i < 20; i += 1) await add({ title: `Sự kiện số ${i}` });
    await add({ status: 'cancelled' }); await add({ startsAt: new Date(Date.now() - 3 * DAY), endsAt: new Date(Date.now() - 2 * DAY) });
    assert.strictEqual((await call(ctrl.createEvent, { user: OWNER, body: good() })).code, 429);
    await add({ ownerId: OWNER2._id, venueId: V3 });
    assert.strictEqual((await call(ctrl.createEvent, { user: OWNER2, body: good({ venueId: V3 }) })).code, 201);
});
test('EV-04 · sửa: chỉ chủ sự kiện; đổi nội dung/ảnh; sự kiện đang diễn ra vẫn sửa nội dung nhưng không dời giờ bắt đầu về quá khứ', async () => {
    seed();
    const ev = await add({ imageUrl: '/uploads/old.jpg' });
    assert.strictEqual((await call(ctrl.updateEvent, { user: OWNER2, params: { id: ev._id }, body: { title: 'Cướp sự kiện' } })).code, 404);
    const r = await call(ctrl.updateEvent, { user: OWNER, params: { id: ev._id }, body: { title: 'Tên mới của sự kiện', price: '0' }, file: { url: '/uploads/new.jpg' } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual([ev.title, ev.imageUrl, removed], ['Tên mới của sự kiện', '/uploads/new.jpg', ['/uploads/old.jpg']]);
    const past = await call(ctrl.updateEvent, { user: OWNER, params: { id: ev._id }, body: { startsAt: iso(-H), endsAt: iso(H) } });
    assert.strictEqual(past.code, 400);
    const live = await add({ startsAt: new Date(Date.now() - H), endsAt: new Date(Date.now() + H) });
    const upd = await call(ctrl.updateEvent, { user: OWNER, params: { id: live._id }, body: { description: 'Mô tả mới được cập nhật cho sự kiện đang diễn ra.' } });
    assert.strictEqual(upd.code, 200);
    assert.strictEqual(upd.body.event.phase, 'ongoing');
});
test('EV-05 · không sửa được sự kiện đã hủy hoặc đã kết thúc (409); gỡ ảnh xóa file; đổi địa điểm phải là địa điểm của mình', async () => {
    seed();
    const cancelled = await add({ status: 'cancelled' });
    const ended = await add({ startsAt: new Date(Date.now() - 3 * H), endsAt: new Date(Date.now() - H) });
    for (const e of [cancelled, ended]) assert.strictEqual((await call(ctrl.updateEvent, { user: OWNER, params: { id: e._id }, body: { title: 'Sửa khi đã đóng' } })).code, 409);
    const ev = await add({ imageUrl: '/uploads/cover.jpg' });
    await call(ctrl.updateEvent, { user: OWNER, params: { id: ev._id }, body: { removeImage: 'true' } });
    assert.deepStrictEqual([ev.imageUrl, removed], ['', ['/uploads/cover.jpg']]);
    assert.strictEqual((await call(ctrl.updateEvent, { user: OWNER, params: { id: ev._id }, body: { venueId: V3 } })).code, 404);
    const moved = await call(ctrl.updateEvent, { user: OWNER, params: { id: ev._id }, body: { venueId: V2 } });
    assert.deepStrictEqual([moved.code, ev.venueName], [200, 'Sân Cầu Giấy']);
});
test('EV-06 · hủy: cần lý do ≥ 5 ký tự, chỉ chủ sự kiện, không hủy lại/hủy sự kiện đã kết thúc', async () => {
    seed();
    const ev = await add();
    assert.strictEqual((await call(ctrl.cancelEvent, { user: OWNER, params: { id: ev._id }, body: { reason: 'ừ' } })).code, 400);
    assert.strictEqual((await call(ctrl.cancelEvent, { user: OWNER2, params: { id: ev._id }, body: { reason: 'Hủy giúp người khác' } })).code, 404);
    const r = await call(ctrl.cancelEvent, { user: OWNER, params: { id: ev._id }, body: { reason: 'Thời tiết xấu, dời sang tháng sau' } });
    assert.deepStrictEqual([r.code, ev.status, ev.cancelReason, r.body.event.phase], [200, 'cancelled', 'Thời tiết xấu, dời sang tháng sau', 'cancelled']);
    assert.ok(ev.cancelledAt instanceof Date);
    assert.strictEqual((await call(ctrl.cancelEvent, { user: OWNER, params: { id: ev._id }, body: { reason: 'Hủy lần nữa' } })).code, 409);
    const ended = await add({ startsAt: new Date(Date.now() - 3 * H), endsAt: new Date(Date.now() - H) });
    assert.strictEqual((await call(ctrl.cancelEvent, { user: OWNER, params: { id: ended._id }, body: { reason: 'Muộn rồi mới hủy' } })).code, 409);
});
test('EV-07 · danh sách của chủ sân: chỉ sự kiện của mình, lọc theo upcoming/ongoing/ended/cancelled', async () => {
    seed();
    await add({ title: 'Sắp tới' });
    await add({ title: 'Đang diễn ra', startsAt: new Date(Date.now() - H), endsAt: new Date(Date.now() + H) });
    await add({ title: 'Đã kết thúc', startsAt: new Date(Date.now() - 3 * H), endsAt: new Date(Date.now() - H) });
    await add({ title: 'Đã hủy', status: 'cancelled' });
    await add({ title: 'Của người khác', ownerId: OWNER2._id, venueId: V3 });
    const titles = async (phase) => (await call(ctrl.getOwnerEvents, { user: OWNER, query: phase ? { phase } : {} })).body.events.map((e) => e.title).sort();
    assert.deepStrictEqual(await titles(), ['Sắp tới', 'Đang diễn ra', 'Đã kết thúc', 'Đã hủy'].sort());
    assert.deepStrictEqual(await titles('upcoming'), ['Sắp tới']);
    assert.deepStrictEqual(await titles('ongoing'), ['Đang diễn ra']);
    assert.deepStrictEqual(await titles('ended'), ['Đã kết thúc']);
    assert.deepStrictEqual(await titles('cancelled'), ['Đã hủy']);
});
test('EV-08 · công khai: ẩn sự kiện đã hủy/đã kết thúc và sự kiện ở địa điểm bị ẩn/chưa duyệt/chủ sân bị khóa phí; sắp theo ngày; không lộ lý do hủy', async () => {
    seed();
    Venue.docs.push({ _id: oid(13), name: 'Bị ẩn', ownerId: OWNER._id, status: 'approved', isActive: false });
    Venue.docs.push({ _id: oid(14), name: 'Chưa duyệt', ownerId: OWNER._id, status: 'pending', isActive: true });
    Venue.docs.push({ _id: oid(15), name: 'Chủ sân bị khóa phí', ownerId: oid(9), status: 'approved', isActive: true });
    blockedOwners = [oid(9)];
    await add({ title: 'B - sau', startsAt: new Date(Date.now() + 3 * DAY), endsAt: new Date(Date.now() + 3 * DAY + H) });
    await add({ title: 'A - trước', startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + DAY + H), type: 'promotion' });
    await add({ title: 'Đã hủy', status: 'cancelled', cancelReason: 'bí mật' });
    await add({ title: 'Đã kết thúc', startsAt: new Date(Date.now() - 3 * H), endsAt: new Date(Date.now() - H) });
    await add({ title: 'Địa điểm ẩn', venueId: oid(13) });
    await add({ title: 'Chưa duyệt', venueId: oid(14) });
    await add({ title: 'Chủ bị khóa', venueId: oid(15), ownerId: oid(9) });
    const all = await call(ctrl.listPublicEvents, { query: {} });
    assert.deepStrictEqual(all.body.events.map((e) => e.title), ['A - trước', 'B - sau']);
    assert.ok(String(Event.log.select).includes('-cancelReason') && String(Event.log.select).includes('-ownerId'));
    assert.deepStrictEqual((await call(ctrl.listPublicEvents, { query: { type: 'promotion' } })).body.events.map((e) => e.title), ['A - trước']);
    assert.deepStrictEqual((await call(ctrl.listPublicEvents, { query: { venueId: V2 } })).body.events, []);
    assert.strictEqual((await call(ctrl.listPublicEvents, { query: { venueId: 'xyz' } })).code, 400);
});
test('EV-09 · chi tiết công khai: đã hủy/đã kết thúc vẫn xem được (kèm phase) để link đã chia sẻ báo đúng tình trạng; địa điểm bị ẩn → 404', async () => {
    seed();
    Venue.docs.push({ _id: oid(13), name: 'Bị ẩn', ownerId: OWNER._id, status: 'approved', isActive: false });
    const cancelled = await add({ status: 'cancelled' });
    const ended = await add({ startsAt: new Date(Date.now() - 3 * H), endsAt: new Date(Date.now() - H) });
    const hidden = await add({ venueId: oid(13) });
    assert.strictEqual((await call(ctrl.getPublicEvent, { params: { id: cancelled._id } })).body.event.phase, 'cancelled');
    assert.strictEqual((await call(ctrl.getPublicEvent, { params: { id: ended._id } })).body.event.phase, 'ended');
    assert.strictEqual((await call(ctrl.getPublicEvent, { params: { id: hidden._id } })).code, 404);
    assert.strictEqual((await call(ctrl.getPublicEvent, { params: { id: oid(999) } })).code, 404);
    assert.strictEqual((await call(ctrl.getPublicEvent, { params: { id: 'xyz' } })).code, 400);
});
test('EV-10 · phaseOf đúng ở mốc biên: đúng lúc bắt đầu/kết thúc vẫn là đang diễn ra', async () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const mk = (s, e, status = 'scheduled') => ({ status, startsAt: new Date(s), endsAt: new Date(e) });
    assert.strictEqual(ctrl._phaseOf(mk('2026-10-20T10:00:00Z', '2026-10-20T12:00:00Z'), now), 'ongoing');
    assert.strictEqual(ctrl._phaseOf(mk('2026-10-20T08:00:00Z', '2026-10-20T10:00:00Z'), now), 'ongoing');
    assert.strictEqual(ctrl._phaseOf(mk('2026-10-20T10:00:01Z', '2026-10-20T12:00:00Z'), now), 'upcoming');
    assert.strictEqual(ctrl._phaseOf(mk('2026-10-20T07:00:00Z', '2026-10-20T09:59:59Z'), now), 'ended');
    assert.strictEqual(ctrl._phaseOf(mk('2026-10-20T11:00:00Z', '2026-10-20T12:00:00Z', 'cancelled'), now), 'cancelled');
});
test('EV-11 · định tuyến: công khai không cần đăng nhập; quản lý của chủ sân nằm sau authorize(owner) + giới hạn tần suất', async () => {
    const root = path.join(__dirname, '..');
    const pub = fs.readFileSync(path.join(root, 'routes', 'eventRoutes.js'), 'utf8');
    assert.ok(pub.includes("router.get('/'") && pub.includes("router.get('/:id'") && !pub.includes('protect'));
    const owner = fs.readFileSync(path.join(root, 'routes', 'ownerRoutes.js'), 'utf8');
    const gate = owner.indexOf("router.use(protect, authorize('owner'))");
    for (const f of ["router.get('/events'", "router.post('/events', writeLimiter", "router.put('/events/:id', writeLimiter", "'/events/:id/cancel', writeLimiter"]) assert.ok(owner.indexOf(f) > gate, f);
    assert.ok(fs.readFileSync(path.join(root, 'server.js'), 'utf8').includes("'/api/events'"));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
