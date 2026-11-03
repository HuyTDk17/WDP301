/**
 * KIỂM THỬ: khách SỬA/XÓA đánh giá của mình, chủ sân TRẢ LỜI đánh giá.
 * Không cần MongoDB — model thay bằng bản giả trong bộ nhớ (xem ownerPaymentFlow.test.js).
 * Khoá chặt: chỉ tác giả mới sửa/xóa được, chỉ chủ sân của địa điểm mới trả lời được,
 * điểm trung bình tính lại sau sửa/xóa, thông báo chỉ gửi ở lần trả lời đầu tiên.
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

const state = {};
function reset() { Object.assign(state, { reviews: [], venues: [], notifications: [], venueUpdates: [] }); }
const getPath = (d, k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), d);
function match(doc, filter = {}) {
    return Object.entries(filter).every(([k, cond]) => {
        const v = getPath(doc, k);
        if (cond === null) return v == null;
        if (cond && typeof cond === 'object' && '$in' in cond) return cond.$in.map(String).includes(String(v));
        if (cond && typeof cond === 'object' && '$ne' in cond) return cond.$ne === null ? v != null : String(v) !== String(cond.$ne);
        return String(v) === String(cond);
    });
}
function chain(rows) {
    let list = rows;
    const p = Promise.resolve(list);
    const self = { then: (a, b) => Promise.resolve(list).then(a, b), catch: (b) => Promise.resolve(list).catch(b),
        populate: () => self, sort: () => self, select: () => self,
        skip: (n) => { list = list.slice(n); return self; }, limit: (n) => { list = list.slice(0, n); return self; } };
    return self;
}
function makeReview(d) {
    const r = { reply: { text: '', repliedAt: null }, editedAt: null, ...d };
    r.save = async () => r;
    r.deleteOne = async () => { state.reviews = state.reviews.filter((x) => x !== r); };
    r.toObject = () => ({ ...r, save: undefined, deleteOne: undefined, toObject: undefined });
    return r;
}
fake('models/Review.js', {
    findOne: async (f) => state.reviews.find((r) => match(r, f)) || null,
    findById: async (id) => state.reviews.find((r) => r._id === id) || null,
    find: (f) => chain(state.reviews.filter((r) => match(r, f))),
    countDocuments: async (f) => state.reviews.filter((r) => match(r, f)).length,
});
fake('models/Venue.js', {
    find: (f) => chain(state.venues.filter((v) => match(v, f))),
    findOne: async (f) => state.venues.find((v) => match(v, f)) || null,
    findByIdAndUpdate: async (id, upd) => { state.venueUpdates.push({ id, ...upd }); },
});
fake('models/User.js', { findById: () => ({ select: async () => null }) });
fake('models/Court.js', {});
fake('models/Booking.js', {});
fake('models/Notification.js', { create: async (n) => { state.notifications.push(n); return Promise.resolve(n); } });
fake('utils/uploads.js', { fileUrl: (f) => f.url, removeStoredFile: async () => {} });
fake('services/settlementService.js', {});
const ctrl = require('../controllers/venueController');

const call = (handler, req) => new Promise((ok, bad) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; ok(this); return this; } };
    handler(req, res, (e) => bad(e));
});

const ME = { _id: oid(1), role: 'customer' }; const OTHER = { _id: oid(2), role: 'customer' };
const OWNER = { _id: oid(5), role: 'owner' }; const OWNER2 = { _id: oid(6), role: 'owner' };
const V1 = oid(10); const V2 = oid(11);
function seed() {
    reset();
    state.venues.push({ _id: V1, name: 'Sân A', ownerId: OWNER._id }, { _id: V2, name: 'Sân B', ownerId: OWNER2._id });
    state.reviews.push(
        makeReview({ _id: oid(30), venueId: V1, userId: ME._id, rating: 5, comment: 'Tuyệt' }),
        makeReview({ _id: oid(31), venueId: V1, userId: OTHER._id, rating: 3, comment: 'Tạm' }),
        makeReview({ _id: oid(32), venueId: V2, userId: OTHER._id, rating: 4, comment: 'Ổn' }),
    );
}
console.log('\n=== ĐÁNH GIÁ: SỬA / XÓA / TRẢ LỜI ===\n');

test('RV-01 · khách sửa đánh giá của mình: lưu điểm + nội dung, đánh dấu đã sửa, tính lại điểm trung bình', async () => {
    seed();
    const r = await call(ctrl.updateReview, { user: ME, params: { id: V1, reviewId: oid(30) }, body: { rating: 2, comment: '  Đổi ý  ' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(state.reviews[0].rating, 2);
    assert.strictEqual(state.reviews[0].comment, 'Đổi ý');
    assert.ok(state.reviews[0].editedAt instanceof Date);
    assert.deepStrictEqual(state.venueUpdates.at(-1), { id: V1, rating: 2.5, reviewCount: 2 });
});
test('RV-02 · không sửa/xóa được đánh giá của người khác, hoặc qua sai địa điểm (404)', async () => {
    seed();
    assert.strictEqual((await call(ctrl.updateReview, { user: OTHER, params: { id: V1, reviewId: oid(30) }, body: { rating: 1 } })).code, 404);
    assert.strictEqual((await call(ctrl.deleteOwnReview, { user: OTHER, params: { id: V1, reviewId: oid(30) } })).code, 404);
    assert.strictEqual((await call(ctrl.updateReview, { user: ME, params: { id: V2, reviewId: oid(30) }, body: { rating: 1 } })).code, 404);
    assert.strictEqual(state.reviews[0].rating, 5);
});
test('RV-03 · điểm ngoài 1–5 hoặc nội dung quá dài → 400', async () => {
    seed();
    for (const rating of [0, 6, 'abc', undefined]) assert.strictEqual((await call(ctrl.updateReview, { user: ME, params: { id: V1, reviewId: oid(30) }, body: { rating } })).code, 400, String(rating));
    assert.strictEqual((await call(ctrl.updateReview, { user: ME, params: { id: V1, reviewId: oid(30) }, body: { rating: 4, comment: 'x'.repeat(1001) } })).code, 400);
});
test('RV-04 · khách xóa đánh giá của mình và điểm trung bình được tính lại', async () => {
    seed();
    const r = await call(ctrl.deleteOwnReview, { user: ME, params: { id: V1, reviewId: oid(30) } });
    assert.strictEqual(r.code, 200);
    assert.ok(!state.reviews.some((x) => x._id === oid(30)));
    assert.deepStrictEqual(state.venueUpdates.at(-1), { id: V1, rating: 3, reviewCount: 1 });
});
test('RV-05 · chủ sân trả lời đánh giá: lưu phản hồi, báo khách ở LẦN ĐẦU, sửa phản hồi không báo lại', async () => {
    seed();
    const r = await call(ctrl.replyToReview, { user: OWNER, params: { id: oid(30) }, body: { text: '  Cảm ơn bạn nhé!  ' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(state.reviews[0].reply.text, 'Cảm ơn bạn nhé!');
    assert.ok(state.reviews[0].reply.repliedAt instanceof Date);
    const n = state.notifications.filter((x) => x.userId === ME._id);
    assert.strictEqual(n.length, 1);
    assert.strictEqual(n[0].link, `/venues/${V1}`);
    await call(ctrl.replyToReview, { user: OWNER, params: { id: oid(30) }, body: { text: 'Cập nhật lại lời cảm ơn.' } });
    assert.strictEqual(state.notifications.filter((x) => x.userId === ME._id).length, 1);
    assert.strictEqual(state.reviews[0].reply.text, 'Cập nhật lại lời cảm ơn.');
});
test('RV-06 · chủ sân khác không trả lời/xóa phản hồi được (404, không lộ đánh giá tồn tại)', async () => {
    seed();
    const stranger = await call(ctrl.replyToReview, { user: OWNER2, params: { id: oid(30) }, body: { text: 'Tôi chen vào' } });
    const missing = await call(ctrl.replyToReview, { user: OWNER2, params: { id: oid(999) }, body: { text: 'Tôi chen vào' } });
    assert.strictEqual(stranger.code, 404);
    assert.deepStrictEqual(stranger.body, missing.body);
    assert.strictEqual((await call(ctrl.deleteReviewReply, { user: OWNER2, params: { id: oid(30) } })).code, 404);
    assert.strictEqual(state.reviews[0].reply.text, '');
});
test('RV-07 · phản hồi rỗng / quá dài → 400', async () => {
    seed();
    assert.strictEqual((await call(ctrl.replyToReview, { user: OWNER, params: { id: oid(30) }, body: { text: ' ' } })).code, 400);
    assert.strictEqual((await call(ctrl.replyToReview, { user: OWNER, params: { id: oid(30) }, body: { text: 'a'.repeat(1001) } })).code, 400);
});
test('RV-08 · chủ sân xóa phản hồi của mình', async () => {
    seed();
    await call(ctrl.replyToReview, { user: OWNER, params: { id: oid(30) }, body: { text: 'Cảm ơn bạn' } });
    const r = await call(ctrl.deleteReviewReply, { user: OWNER, params: { id: oid(30) } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(state.reviews[0].reply.text, '');
    assert.strictEqual(state.reviews[0].reply.repliedAt, null);
});
test('RV-09 · danh sách của chủ sân chỉ gồm địa điểm của mình, lọc chưa trả lời, đếm số chưa trả lời, bỏ qua venueId lạ', async () => {
    seed();
    await call(ctrl.replyToReview, { user: OWNER, params: { id: oid(30) }, body: { text: 'Cảm ơn bạn' } });
    const all = await call(ctrl.getOwnerReviews, { user: OWNER, query: {} });
    assert.deepStrictEqual(all.body.reviews.map((r) => r._id).sort(), [oid(30), oid(31)]);
    assert.strictEqual(all.body.reviews[0].venueName, 'Sân A');
    assert.strictEqual(all.body.unreplied, 1);
    const pending = await call(ctrl.getOwnerReviews, { user: OWNER, query: { replied: 'false' } });
    assert.deepStrictEqual(pending.body.reviews.map((r) => r._id), [oid(31)]);
    const done = await call(ctrl.getOwnerReviews, { user: OWNER, query: { replied: 'true' } });
    assert.deepStrictEqual(done.body.reviews.map((r) => r._id), [oid(30)]);
    const foreign = await call(ctrl.getOwnerReviews, { user: OWNER, query: { venueId: V2 } });
    assert.ok(foreign.body.reviews.every((r) => String(r.venueId) === V1), 'không được lộ đánh giá của chủ sân khác');
});
test('RV-10 · định tuyến đã đăng ký (khách: PUT/DELETE; chủ sân: GET/POST/DELETE) và model có trường reply', async () => {
    const root = path.join(__dirname, '..');
    const vr = fs.readFileSync(path.join(root, 'routes', 'venueRoutes.js'), 'utf8');
    assert.ok(vr.includes("router.put('/:id/reviews/:reviewId', protect") && vr.includes("router.delete('/:id/reviews/:reviewId', protect"));
    const or = fs.readFileSync(path.join(root, 'routes', 'ownerRoutes.js'), 'utf8');
    for (const f of ["router.get('/reviews'", "'/reviews/:id/reply', writeLimiter, venueController.replyToReview", "venueController.deleteReviewReply"]) assert.ok(or.includes(f), f);
    assert.ok(fs.readFileSync(path.join(root, 'models', 'Review.js'), 'utf8').includes('reply:'));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
