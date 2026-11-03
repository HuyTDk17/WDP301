/**
 * KIỂM THỬ MODULE KHIẾU NẠI (khách gửi → admin nhận xử lý / liên hệ / giải quyết).
 *
 * Không cần MongoDB: model được thay bằng bản giả trong bộ nhớ (nhét vào
 * require.cache TRƯỚC khi nạp controller), asyncHandler và mongoose.isValidObjectId là mã thật.
 * Khoá chặt các quy tắc: khách chỉ khiếu nại lượt đặt của CHÍNH MÌNH, chủ sân suy ra từ
 * địa điểm (không tin client), không gửi trùng, không xử lý hai lần, khách không thấy tin gửi chủ sân.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

const resolve = (rel) => require.resolve(path.join(__dirname, '..', rel));
function fake(rel, exports) {
    const filename = resolve(rel);
    require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
const oid = (n) => Number(n).toString(16).padStart(24, '0');
const q = (v) => { const p = Promise.resolve(v); p.select = () => q(v); p.populate = () => q(v); p.sort = () => q(v); p.limit = () => q(v); return p; };

const state = {};
let seq = 0;
function reset() {
    seq = 100;
    Object.assign(state, { complaints: [], notifications: [], users: [], venues: [], bookings: [] });
}
function match(doc, filter = {}) {
    return Object.entries(filter).every(([k, cond]) => {
        const v = doc[k];
        if (cond && typeof cond === 'object' && '$in' in cond) return cond.$in.includes(v);
        return String(v) === String(cond);
    });
}
function makeDoc(data) {
    const d = { ...data };
    d.save = async () => d;
    d.toObject = () => JSON.parse(JSON.stringify({ ...d, save: undefined, toObject: undefined }));
    return d;
}

const Complaint = {
    CATEGORIES: ['service', 'facility', 'payment', 'refund', 'staff', 'other'],
    STATUSES: ['open', 'investigating', 'resolved', 'rejected'],
    create: async (data) => { const c = makeDoc({ _id: oid(++seq), status: 'open', active: true, messages: [], ...data }); state.complaints.push(c); return c; },
    exists: async (f) => (state.complaints.find((c) => match(c, f)) ? { _id: 1 } : null),
    countDocuments: async (f) => state.complaints.filter((c) => match(c, f)).length,
    findOne: async (f) => state.complaints.find((c) => match(c, f)) || null,
    findById: async (id) => state.complaints.find((c) => c._id === id) || null,
    findOneAndUpdate: async (f, update) => { const c = state.complaints.find((x) => match(x, f)); if (!c) return null; Object.assign(c, update); return c; },
};
fake('models/Complaint.js', Complaint);
fake('models/Booking.js', { findOne: async (f) => state.bookings.find((b) => match(b, f)) || null });
fake('models/Venue.js', { findById: async (id) => state.venues.find((v) => v._id === id) || null });
fake('models/User.js', { find: (f) => q(state.users.filter((u) => match(u, { role: f.role }))) });
fake('models/Notification.js', { create: async (n) => { state.notifications.push(n); return n; } });
fake('utils/uploads.js', { fileUrl: (f) => f.url });

const ctrl = require('../controllers/complaintController');

// asyncHandler của dự án KHÔNG trả về Promise, nên helper chờ đến khi controller thật sự phản hồi (json) hoặc báo lỗi (next).
const call = (handler, req) => new Promise((resolveCall, reject) => {
    const res = {
        code: 200, body: null,
        status(c) { this.code = c; return this; },
        json(b) { this.body = b; resolveCall(this); return this; },
    };
    handler(req, res, (e) => reject(e));
});

const CUSTOMER = { _id: oid(1), name: 'Khách A', role: 'customer' };
const OTHER = { _id: oid(2), name: 'Khách B', role: 'customer' };
const ADMIN = { _id: oid(3), name: 'Admin', role: 'admin' };
const OWNER_ID = oid(4);
const LONG = 'Sân bị ướt, đèn hỏng và chủ sân không hoàn tiền như đã hẹn.';

function seed() {
    reset();
    state.users.push({ _id: ADMIN._id, role: 'admin', status: 'active' });
    state.venues.push({ _id: oid(10), name: 'Sân Mỹ Đình', ownerId: OWNER_ID });
    state.venues.push({ _id: oid(11), name: 'Sân của tôi', ownerId: CUSTOMER._id });
    state.bookings.push({ _id: oid(20), customerId: CUSTOMER._id, venueId: oid(10) });
    state.bookings.push({ _id: oid(21), customerId: OTHER._id, venueId: oid(10) });
}
const body = (extra) => ({ category: 'service', subject: 'Sân không đúng mô tả', description: LONG, ...extra });

console.log('\n=== KHIẾU NẠI ===\n');

test('CP-01 · thiếu cả lượt đặt lẫn địa điểm → 400', async () => {
    seed();
    const r = await call(ctrl.createComplaint, { user: CUSTOMER, body: body({}), files: [] });
    assert.strictEqual(r.code, 400);
});
test('CP-02 · mô tả quá ngắn / tiêu đề quá ngắn / loại sai → 400', async () => {
    seed();
    assert.strictEqual((await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20), description: 'ngắn' }) })).code, 400);
    assert.strictEqual((await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20), subject: 'ab' }) })).code, 400);
    assert.strictEqual((await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20), category: 'hack' }) })).code, 400);
    assert.strictEqual(state.complaints.length, 0);
});
test('CP-03 · không khiếu nại được lượt đặt của người khác (404)', async () => {
    seed();
    const r = await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(21) }) });
    assert.strictEqual(r.code, 404);
});
test('CP-04 · không khiếu nại địa điểm của chính mình (400)', async () => {
    seed();
    const r = await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ venueId: oid(11) }) });
    assert.strictEqual(r.code, 400);
});
test('CP-05 · gửi thành công: chủ sân suy ra từ địa điểm (bỏ qua ownerId client gửi), lưu ảnh, báo admin', async () => {
    seed();
    const r = await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20), ownerId: 'KE_TAN_CONG' }), files: [{ url: 'https://x/a.jpg' }, { url: 'https://x/b.jpg' }] });
    assert.strictEqual(r.code, 201);
    const c = state.complaints[0];
    assert.strictEqual(c.ownerId, OWNER_ID);
    assert.strictEqual(c.venueName, 'Sân Mỹ Đình');
    assert.deepStrictEqual(c.evidence, ['https://x/a.jpg', 'https://x/b.jpg']);
    assert.strictEqual(c.status, 'open');
    assert.ok(state.notifications.some((n) => n.userId === ADMIN._id && n.link === '/admin/complaints'));
    assert.ok(!state.notifications.some((n) => n.userId === OWNER_ID), 'chưa báo chủ sân khi mới gửi');
});
test('CP-06 · lượt đặt đã có khiếu nại đang xử lý → 409', async () => {
    seed();
    await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20) }) });
    const r = await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20) }) });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(state.complaints.length, 1);
});
test('CP-07 · đang có 5 khiếu nại chưa xong → 429', async () => {
    seed();
    for (let i = 0; i < 5; i += 1) await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ venueId: oid(10) }) });
    const r = await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ venueId: oid(10) }) });
    assert.strictEqual(r.code, 429);
    assert.strictEqual(state.complaints.length, 5);
});
test('CP-08 · nhận xử lý: open → investigating, báo khách; bấm lần hai → 409', async () => {
    seed();
    const c = (await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20) }) })).body.complaint;
    const r1 = await call(ctrl.startInvestigation, { user: ADMIN, params: { id: c._id } });
    assert.strictEqual(r1.body.complaint.status, 'investigating');
    assert.ok(state.notifications.some((n) => n.userId === CUSTOMER._id && /đang được xử lý/.test(n.title)));
    assert.strictEqual((await call(ctrl.startInvestigation, { user: ADMIN, params: { id: c._id } })).code, 409);
    assert.strictEqual((await call(ctrl.startInvestigation, { user: ADMIN, params: { id: oid(999) } })).code, 404);
});
test('CP-09 · liên hệ: sai người nhận / nội dung ngắn → 400; gửi chủ sân không lộ danh tính khách', async () => {
    seed();
    const c = (await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20) }) })).body.complaint;
    assert.strictEqual((await call(ctrl.contactParty, { user: ADMIN, params: { id: c._id }, body: { target: 'admin', message: 'xin chào bạn' } })).code, 400);
    assert.strictEqual((await call(ctrl.contactParty, { user: ADMIN, params: { id: c._id }, body: { target: 'owner', message: 'hi' } })).code, 400);
    const r = await call(ctrl.contactParty, { user: ADMIN, params: { id: c._id }, body: { target: 'owner', message: 'Vui lòng cung cấp biên lai hoàn tiền.' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(state.complaints[0].status, 'investigating');
    const n = state.notifications.find((x) => x.userId === OWNER_ID);
    assert.ok(n && !n.message.includes(CUSTOMER.name) && !n.title.includes(CUSTOMER.name));
});
test('CP-10 · khách chỉ thấy tin gửi cho mình và không xem được khiếu nại của người khác', async () => {
    seed();
    const c = (await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20) }) })).body.complaint;
    await call(ctrl.contactParty, { user: ADMIN, params: { id: c._id }, body: { target: 'owner', message: 'Tin riêng gửi chủ sân.' } });
    await call(ctrl.contactParty, { user: ADMIN, params: { id: c._id }, body: { target: 'customer', message: 'Tin gửi cho khách hàng.' } });
    const mine = await call(ctrl.getMyComplaintById, { user: CUSTOMER, params: { id: c._id } });
    assert.deepStrictEqual(mine.body.complaint.messages.map((m) => m.to), ['customer']);
    assert.strictEqual((await call(ctrl.getMyComplaintById, { user: OTHER, params: { id: c._id } })).code, 404);
});
test('CP-11 · giải quyết: cần quyết định hợp lệ + phản hồi ≥ 10 ký tự; báo khách (và chủ sân nếu resolved); không xử lý hai lần', async () => {
    seed();
    const c = (await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20) }) })).body.complaint;
    assert.strictEqual((await call(ctrl.resolveComplaint, { user: ADMIN, params: { id: c._id }, body: { decision: 'xoa', resolution: 'Đã hoàn tiền cho khách.' } })).code, 400);
    assert.strictEqual((await call(ctrl.resolveComplaint, { user: ADMIN, params: { id: c._id }, body: { decision: 'resolved', resolution: 'ok' } })).code, 400);
    const r = await call(ctrl.resolveComplaint, { user: ADMIN, params: { id: c._id }, body: { decision: 'resolved', resolution: 'Đã yêu cầu chủ sân hoàn 100% tiền sân.' } });
    assert.strictEqual(r.body.complaint.status, 'resolved');
    assert.strictEqual(state.complaints[0].active, false);
    assert.strictEqual(state.complaints[0].resolvedBy, ADMIN._id);
    assert.ok(state.notifications.some((n) => n.userId === CUSTOMER._id && n.message.includes('hoàn 100%')));
    assert.ok(state.notifications.some((n) => n.userId === OWNER_ID && /đã được xử lý/.test(n.title)));
    assert.strictEqual((await call(ctrl.resolveComplaint, { user: ADMIN, params: { id: c._id }, body: { decision: 'rejected', resolution: 'Đổi ý từ chối khiếu nại.' } })).code, 409);
    assert.strictEqual((await call(ctrl.contactParty, { user: ADMIN, params: { id: c._id }, body: { target: 'customer', message: 'Còn gì nữa không?' } })).code, 409);
});
test('CP-12 · từ chối khiếu nại: báo khách kèm lý do, KHÔNG làm phiền chủ sân', async () => {
    seed();
    const c = (await call(ctrl.createComplaint, { user: CUSTOMER, body: body({ bookingId: oid(20) }) })).body.complaint;
    const r = await call(ctrl.resolveComplaint, { user: ADMIN, params: { id: c._id }, body: { decision: 'rejected', resolution: 'Không đủ bằng chứng để xác nhận lỗi của chủ sân.' } });
    assert.strictEqual(r.body.complaint.status, 'rejected');
    assert.ok(!state.notifications.some((n) => n.userId === OWNER_ID));
});
test('CP-13 · ID sai định dạng → 400, không ném lỗi', async () => {
    seed();
    assert.strictEqual((await call(ctrl.getMyComplaintById, { user: CUSTOMER, params: { id: 'abc' } })).code, 400);
    assert.strictEqual((await call(ctrl.resolveComplaint, { user: ADMIN, params: { id: 'abc' }, body: {} })).code, 400);
});
test('CP-14 · định tuyến: khách qua /api/complaints (chỉ customer), admin qua /api/admin/complaints (đã có authorize admin)', async () => {
    const root = path.join(__dirname, '..');
    const cr = fs.readFileSync(path.join(root, 'routes', 'complaintRoutes.js'), 'utf8');
    assert.ok(cr.includes("authorize('customer')") && cr.includes('uploadEvidence.array'));
    const ar = fs.readFileSync(path.join(root, 'routes', 'adminRoutes.js'), 'utf8');
    for (const frag of ["router.get('/complaints'", "'/complaints/:id/start'", "'/complaints/:id/contact'", "'/complaints/:id/resolve'"]) assert.ok(ar.includes(frag), frag);
    assert.ok(ar.indexOf("authorize('admin')") < ar.indexOf("router.get('/complaints'"));
    assert.ok(fs.readFileSync(path.join(root, 'server.js'), 'utf8').includes("'/api/complaints'"));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
