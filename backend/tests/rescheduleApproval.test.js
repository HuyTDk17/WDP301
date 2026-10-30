/**
 * KIỂM THỬ #33 — CHỦ SÂN XEM VÀ XỬ LÝ YÊU CẦU ĐỔI LỊCH.
 * Khoá chặt: cài đặt duyệt đổi lịch tri-state (null = theo cài đặt cũ nên không đổi hành vi của chủ sân hiện có);
 * đổi lịch tách khỏi "chuyển đến/chuyển đi"; thông báo dùng lời lẽ "đổi lịch" và chỉ báo chủ sân một lần;
 * cập nhật chính sách theo từng trường (trước đây thiếu trường sẽ bị đặt về false); các loại chuyển khác giữ nguyên nội dung.
 * Dùng model THẬT nhưng ghi đè truy vấn — không cần MongoDB.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
const oid = (n) => Number(n).toString(16).padStart(24, '0');

const { requiresOwnerApproval } = require('../utils/transferPolicy');
const msg = require('../utils/transferMessages');
const TransferRequest = require('../models/TransferRequest');
const Venue = require('../models/Venue');
const transferService = require('../services/transferService');
const ctrl = require('../controllers/transferController');

const call = (handler, req) => new Promise((ok, bad) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; ok(this); return this; } };
    handler({ body: {}, params: {}, query: {}, ...req }, res, (e) => bad(e));
});
const ME = oid(1); const OTHER = oid(2); const CUS = oid(9);
const quote = (over = {}) => ({ settlement: 0, refundCredit: 0, compensation: 0, transferFee: 0, newAmount: 200000, ...over });
const base = (over = {}) => ({
    customerId: CUS, fromOwnerId: ME, toOwnerId: ME, fromVenueName: 'Sân Mỹ Đình', toVenueName: 'Sân Mỹ Đình',
    fromCourtName: 'Sân 1', toCourtName: 'Sân 1', fromDate: '2026-10-20', fromStartTime: '18:00', fromEndTime: '19:00',
    toDate: '2026-10-21', toStartTime: '19:00', toEndTime: '20:00', type: 'T1', quote: quote(), ...over,
});

console.log('\n=== ĐỔI LỊCH — CHỦ SÂN XỬ LÝ (#33) ===\n');
test('RA-01 · duyệt đổi lịch tri-state: null/không có = theo cài đặt "chuyển đến" (giữ hành vi cũ); true/false ghi đè CHỈ cho T1/T2', async () => {
    const v = (reschedule, transfer) => ({ rescheduleRequiresApproval: reschedule, transferRequiresApproval: transfer });
    for (const type of ['T1', 'T2']) {
        assert.strictEqual(requiresOwnerApproval(v(null, true), type), true, 'chủ sân đã bật duyệt thủ công → đổi lịch vẫn phải duyệt như trước');
        assert.strictEqual(requiresOwnerApproval(v(undefined, false), type), false);
        assert.strictEqual(requiresOwnerApproval({ transferRequiresApproval: true }, type), true, 'chủ sân cũ chưa có trường mới');
        assert.strictEqual(requiresOwnerApproval(v(false, true), type), false, 'tự chấp nhận đổi lịch dù duyệt thủ công chuyển đến');
        assert.strictEqual(requiresOwnerApproval(v(true, false), type), true, 'duyệt đổi lịch dù tự chấp nhận chuyển đến');
    }
    for (const type of ['T3', 'T4', 'T5']) {
        assert.strictEqual(requiresOwnerApproval(v(true, false), type), false, `${type} không bị cài đặt đổi lịch ảnh hưởng`);
        assert.strictEqual(requiresOwnerApproval(v(false, true), type), true, type);
    }
    assert.strictEqual(requiresOwnerApproval(null, 'T1'), false);
});
test('RA-02 · thông báo hoàn tất ĐỔI LỊCH: đúng 2 thông báo (khách + chủ sân MỘT lần), lời lẽ "đổi lịch", phí chỉ hiện khi > 0', async () => {
    const t = base({ quote: quote({ settlement: 20000, transferFee: 10000 }) });
    const list = msg.completedNotifications(t);
    assert.strictEqual(list.length, 2);
    const [customer, owner] = list;
    assert.deepStrictEqual([customer.userId, owner.userId], [CUS, ME]);
    assert.match(customer.title, /đổi lịch/i);
    assert.match(customer.message, /18:00–19:00.*19:00–20:00/);
    assert.match(customer.message, /thanh toán thêm 20\.000đ/);
    assert.match(owner.title, /đổi lịch/i);
    assert.match(owner.message, /phí đổi lịch 10\.000đ/);
    assert.ok(!/chuyển đi|chuyển đến|chuyển sân/.test(JSON.stringify(list)), 'không còn lời lẽ chuyển sân');
    assert.ok(!/phí đổi lịch/.test(msg.completedNotifications(base())[1].message), 'phí 0 thì không nhắc');
    assert.strictEqual(msg.completedNotifications(base({ toOwnerId: null }))[1].userId, ME, 'thiếu toOwnerId thì dùng chủ sân gốc');
});
test('RA-03 · chuyển sân (T3/T4) GIỮ NGUYÊN nội dung và số lượng thông báo như cũ', async () => {
    for (const type of ['T3', 'T4']) {
        const list = msg.completedNotifications(base({ type, toOwnerId: OTHER, quote: quote({ compensation: 30000 }) }));
        assert.deepStrictEqual(list.map((n) => n.title), ['Đã chuyển sân thành công', 'Một lượt đặt đã được chuyển đi', 'Bạn có lượt đặt mới được chuyển đến'], type);
        assert.match(list[1].message, /khoản bồi thường 30\.000đ/);
        assert.deepStrictEqual(list.map((n) => n.userId), [CUS, ME, OTHER]);
    }
    assert.match(msg.completedNotifications(base({ type: 'T4', toOwnerId: OTHER }))[1].message, /Khung giờ đã mở lại/);
});
test('RA-04 · thông báo xin duyệt: đổi lịch nêu cả lịch cũ và mới + link thẳng tới tab Đổi lịch; chuyển sân giữ nguyên', async () => {
    const r = msg.approvalRequest(base(), 30);
    assert.strictEqual(r.title, 'Khách xin đổi lịch');
    assert.match(r.message, /18:00–19:00/); assert.match(r.message, /19:00–20:00/); assert.match(r.message, /30 phút/); assert.match(r.message, /giữ nguyên lịch cũ/);
    assert.strictEqual(r.link, '/owner/transfers?tab=reschedule');
    const old = msg.approvalRequest(base({ type: 'T4' }), 30);
    assert.deepStrictEqual([old.title, old.link], ['Có yêu cầu chuyển sân đến địa điểm của bạn', '/owner/transfers']);
});
test('RA-05 · thông báo thất bại: đổi lịch nói rõ lịch gốc còn nguyên; có khoản đã thu thì báo hoàn', async () => {
    const f = msg.failureNotification(base(), 'Chủ sân từ chối', 15000);
    assert.strictEqual(f.title, 'Yêu cầu đổi lịch không thành công');
    assert.match(f.message, /Lịch đặt ban đầu.*VẪN CÒN HIỆU LỰC.*15\.000đ.*hoàn lại/);
    assert.ok(!/hoàn lại/.test(msg.failureNotification(base(), 'Hết hạn', 0).message));
    assert.strictEqual(msg.failureNotification(base({ type: 'T4' }), 'x', 0).title, 'Yêu cầu chuyển sân không thành công');
});
// ── API chủ sân ──
const chain = (rows) => { const self = { then: (a, b) => Promise.resolve(rows).then(a, b), populate: () => self, sort: () => self, limit: () => self }; return self; };
test('RA-06 · danh sách của chủ sân: đổi lịch TÁCH khỏi chuyển đến/chuyển đi (không còn hiện hai lần), đếm riêng yêu cầu chờ duyệt', async () => {
    const rows = [
        { _id: 'r1', type: 'T1', toOwnerId: ME, fromOwnerId: ME, status: 'awaiting_owner_approval' },
        { _id: 'r2', type: 'T2', toOwnerId: ME, fromOwnerId: ME, status: 'completed' },
        { _id: 'r3', type: 'T1', toOwnerId: ME, fromOwnerId: ME, status: 'awaiting_owner_approval' },
        { _id: 'm1', type: 'T4', toOwnerId: ME, fromOwnerId: OTHER, status: 'awaiting_owner_approval' },
        { _id: 'm2', type: 'T4', toOwnerId: OTHER, fromOwnerId: ME, status: 'completed' },
        { _id: 'm3', type: 'T3', toOwnerId: ME, fromOwnerId: ME, status: 'completed' },
        { _id: 'x1', type: 'T1', toOwnerId: OTHER, fromOwnerId: OTHER, status: 'awaiting_owner_approval' },   // của chủ sân khác — không được thấy
    ].filter((r) => [r.toOwnerId, r.fromOwnerId].includes(ME));                                                  // mô phỏng bộ lọc $or của truy vấn
    TransferRequest.find = () => chain(rows);
    const r = await call(ctrl.getOwnerTransfers, { user: { _id: ME } });
    const ids = (a) => a.map((t) => t._id).sort();
    assert.deepStrictEqual(ids(r.body.reschedules), ['r1', 'r2', 'r3']);
    assert.deepStrictEqual(ids(r.body.incoming), ['m1', 'm3']);
    assert.deepStrictEqual(ids(r.body.outgoing), ['m2', 'm3']);
    assert.ok(![...r.body.incoming, ...r.body.outgoing].some((t) => ['T1', 'T2'].includes(t.type)), 'đổi lịch không lẫn vào hai tab cũ');
    assert.deepStrictEqual([r.body.pendingCount, r.body.pendingRescheduleCount], [1, 2]);
});
test('RA-07 · cập nhật chính sách duyệt theo TỪNG TRƯỜNG: gửi một trường không làm đổi trường kia; null = theo cài đặt cũ; giá trị lạ → 400; chỉ chủ địa điểm', async () => {
    const venue = { _id: oid(5), ownerId: ME, transferRequiresApproval: true, rescheduleRequiresApproval: null, save: async () => venue };
    Venue.findById = async (id) => (id === venue._id ? venue : null);
    const patch = (body, user = { _id: ME }) => call(ctrl.setVenueTransferPolicy, { user, params: { id: venue._id }, body });
    assert.strictEqual((await patch({ rescheduleRequiresApproval: false })).code, 200);
    assert.deepStrictEqual([venue.transferRequiresApproval, venue.rescheduleRequiresApproval], [true, false], 'không làm mất cài đặt chuyển đến');
    await patch({ transferRequiresApproval: false });                       // lời gọi kiểu cũ chỉ gửi một trường
    assert.deepStrictEqual([venue.transferRequiresApproval, venue.rescheduleRequiresApproval], [false, false]);
    await patch({ rescheduleRequiresApproval: null });
    assert.strictEqual(venue.rescheduleRequiresApproval, null);
    for (const bad of ['true', 1, 'yes', {}]) assert.strictEqual((await patch({ rescheduleRequiresApproval: bad })).code, 400, String(bad));
    assert.strictEqual((await patch({ transferRequiresApproval: true }, { _id: OTHER })).code, 403);
    assert.strictEqual((await call(ctrl.setVenueTransferPolicy, { user: { _id: ME }, params: { id: oid(404) }, body: {} })).code, 404);
});
test('RA-08 · chủ sân từ chối không nêu lý do: lý do mặc định đúng loại (đổi lịch / chuyển đến); từ chối đúng chủ sân đích', async () => {
    const reasons = [];
    const realAbort = transferService.abort;
    transferService.abort = async (t, status, reason) => { reasons.push(reason); return t; };
    try {
        const find = (type, toOwnerId = ME) => { TransferRequest.findById = async () => ({ _id: 'r', type, toOwnerId, status: 'awaiting_owner_approval' }); };
        find('T1'); await call(ctrl.reject, { user: { _id: ME }, params: { id: 'r' }, body: {} });
        find('T4'); await call(ctrl.reject, { user: { _id: ME }, params: { id: 'r' }, body: {} });
        find('T1'); await call(ctrl.reject, { user: { _id: ME }, params: { id: 'r' }, body: { reason: '  Sân bảo trì  ' } });
        assert.deepStrictEqual(reasons, ['Chủ sân từ chối yêu cầu đổi lịch', 'Chủ sân từ chối yêu cầu chuyển đến', 'Sân bảo trì']);
        find('T1', OTHER);
        assert.strictEqual((await call(ctrl.reject, { user: { _id: ME }, params: { id: 'r' }, body: {} })).code, 403);
    } finally { transferService.abort = realAbort; }
});
test('RA-09 · đã gắn đủ: báo giá và xác nhận đều dùng requiresOwnerApproval (không còn đọc thẳng cờ cũ); thông báo lấy từ hàm thuần', async () => {
    const root = path.join(__dirname, '..');
    const ts = fs.readFileSync(path.join(root, 'services', 'transferService.js'), 'utf8');
    assert.strictEqual((ts.match(/requiresOwnerApproval\(toVenue/g) || []).length, 2);
    assert.ok(!/toVenue\??\.transferRequiresApproval/.test(ts));
    assert.ok(ts.includes('transferMessages.approvalRequest') && ts.includes('transferMessages.completedNotifications') && ts.includes('transferMessages.failureNotification'));
    assert.ok(/rescheduleRequiresApproval: \{ type: Boolean, default: null \}/.test(fs.readFileSync(path.join(root, 'models', 'Venue.js'), 'utf8')));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
