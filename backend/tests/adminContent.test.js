/**
 * KIỂM THỬ 5 CHỨC NĂNG QUẢN TRỊ NỘI DUNG: đổi vai trò, banner, tin tức, trang chính sách, danh mục môn.
 * Model thay bằng bản giả trong bộ nhớ (không cần MongoDB) — khoá chặt các quy tắc nghiệp vụ & bảo mật:
 * link banner an toàn, bản nháp không lộ ra công khai, slug tiếng Việt không trùng, không xóa môn đang dùng,
 * không hạ vai trò chủ sân khi còn lượt đặt chưa diễn ra, không đổi vai trò admin/chính mình.
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

// ── Kho dữ liệu giả + bộ lọc tối thiểu (đủ cho các truy vấn trong controller) ──
let seq = 1000;
const getPath = (d, k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), d);
function match(doc, filter = {}) {
    return Object.entries(filter).every(([k, cond]) => {
        if (k === '$and') return cond.every((f) => match(doc, f));
        if (k === '$or') return cond.some((f) => match(doc, f));
        const v = getPath(doc, k);
        if (cond instanceof RegExp) return cond.test(String(v ?? ''));
        if (cond === null) return v == null;
        if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('$in' in cond) return cond.$in.map(String).includes(String(v));
            if ('$ne' in cond) return String(v) !== String(cond.$ne);
            if ('$lte' in cond) return v != null && v <= cond.$lte;
            if ('$gte' in cond) return v != null && v >= cond.$gte;
        }
        return String(v) === String(cond);
    });
}
function chain(rows, log) {
    let list = [...rows];
    const self = {
        then: (a, b) => Promise.resolve(list).then(a, b), catch: (b) => Promise.resolve(list).catch(b),
        sort: (o) => { const [k, dir] = Object.entries(o)[0]; list.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir); return self; },
        skip: (n) => { list = list.slice(n); return self; }, limit: (n) => { list = list.slice(0, n); return self; },
        select: (f) => { if (log) log.select = f; return self; },
    };
    return self;
}
function makeModel(defaults = {}) {
    const M = { docs: [], lastSelect: {} };
    const decorate = (d) => {
        const doc = { ...defaults, ...d };
        doc.save = async () => doc;
        doc.deleteOne = async () => { M.docs = M.docs.filter((x) => x !== doc); };
        doc.toObject = () => ({ ...doc, save: undefined, deleteOne: undefined, toObject: undefined });
        return doc;
    };
    M.create = async (d) => { const doc = decorate({ _id: oid(++seq), createdAt: new Date(), ...d }); M.docs.push(doc); return doc; };
    M.insertMany = async (arr) => { arr.forEach((d) => { M.docs.push(decorate({ _id: oid(++seq), ...d })); }); };
    M.estimatedDocumentCount = async () => M.docs.length;
    M.countDocuments = async (f) => M.docs.filter((d) => match(d, f)).length;
    M.exists = async (f) => (M.docs.find((d) => match(d, f)) ? { _id: 1 } : null);
    M.find = (f) => chain(M.docs.filter((d) => match(d, f)), M.lastSelect);
    M.findOne = (f) => {
        let spec = null;
        const resolveOne = () => {
            const rows = M.docs.filter((d) => match(d, f));
            if (spec) { const [k, dir] = Object.entries(spec)[0]; rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir); }
            return rows[0] || null;
        };
        const self = {
            then: (a, b) => Promise.resolve(resolveOne()).then(a, b), catch: (b) => Promise.resolve(resolveOne()).catch(b),
            sort: (o) => { spec = o; return self; }, select: (x) => { M.lastSelect.findOne = x; return self; },
        };
        return self;
    };
    M.findById = (id) => { const p = Promise.resolve(M.docs.find((d) => d._id === id) || null); p.select = () => p; return p; };
    M.findByIdAndDelete = async (id) => { const d = M.docs.find((x) => x._id === id); if (d) M.docs = M.docs.filter((x) => x !== d); return d || null; };
    M.findByIdAndUpdate = async (id, upd) => { const d = M.docs.find((x) => x._id === id); if (!d) return null; Object.assign(d, upd); return d; };
    M.updateMany = async (f, upd) => { const hit = M.docs.filter((d) => match(d, f)); hit.forEach((d) => Object.assign(d, upd)); return { modifiedCount: hit.length }; };
    return M;
}

const Banner = makeModel({ isActive: true, order: 0, startsAt: null, endsAt: null, subtitle: '', linkUrl: '' });
const News = makeModel({ status: 'draft', publishedAt: null, coverImage: '', summary: '' });
const Policy = makeModel({ isPublished: true, intro: '' });
const SportCategory = makeModel({ isActive: true, order: 0, icon: '🏅', color: '#0A84FF' });
const Venue = makeModel({ isActive: true, suspendedByOwnerBan: false });
const Court = makeModel();
const Booking = makeModel();
const User = makeModel();
const Notification = makeModel();
const removed = [];
fake('models/Banner.js', Banner); fake('models/News.js', News); fake('models/Policy.js', Policy);
fake('models/SportCategory.js', SportCategory); fake('models/Venue.js', Venue); fake('models/Court.js', Court);
fake('models/Booking.js', Booking); fake('models/User.js', User); fake('models/Notification.js', Notification);
fake('utils/uploads.js', { fileUrl: (f) => f.url, removeStoredFile: (u) => removed.push(u) });

const content = require('../controllers/contentController');
const sports = require('../controllers/sportCategoryController');
const users = require('../controllers/userController');
const { checkSport, DEFAULTS, _resetSeeding } = require('../utils/sportCategories');
const slugify = require('../utils/slugify');

const call = (handler, req) => new Promise((ok, bad) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; ok(this); return this; } };
    handler({ body: {}, params: {}, query: {}, ...req }, res, (e) => bad(e));
});
function reset() {
    for (const M of [Banner, News, Policy, SportCategory, Venue, Court, Booking, User, Notification]) { M.docs = []; M.lastSelect = {}; }
    removed.length = 0;
    _resetSeeding();
}
const ADMIN = { _id: oid(1), role: 'admin', name: 'Admin' };
const DAY = 86400000;

console.log('\n=== QUẢN TRỊ NỘI DUNG ===\n');

// ── Banner ──
test('AC-01 · banner công khai: chỉ banner đang bật và trong khung thời gian, theo thứ tự', async () => {
    reset();
    const now = Date.now();
    await Banner.create({ title: 'B2', order: 2 });
    await Banner.create({ title: 'B1', order: 1, startsAt: new Date(now - DAY), endsAt: new Date(now + DAY) });
    await Banner.create({ title: 'Tắt', isActive: false });
    await Banner.create({ title: 'Hết hạn', endsAt: new Date(now - DAY) });
    await Banner.create({ title: 'Chưa tới', startsAt: new Date(now + DAY) });
    const r = await call(content.getPublicBanners, {});
    assert.deepStrictEqual(r.body.banners.map((b) => b.title), ['B1', 'B2']);
});
test('AC-02 · link banner: chặn javascript:, //host-ngoài; nhận "/venues" và https', async () => {
    reset();
    for (const bad of ['javascript:alert(1)', '//evil.com/x', 'data:text/html,<script>', 'ftp://x.vn', '/ có khoảng trắng']) {
        const r = await call(content.createBanner, { user: ADMIN, body: { title: 'T', linkUrl: bad }, file: { url: '/uploads/b.jpg' } });
        assert.strictEqual(r.code, 400, bad);
    }
    for (const ok of ['/venues?sport=football', 'https://esport360.vn/news', '']) {
        const r = await call(content.createBanner, { user: ADMIN, body: { title: 'T', linkUrl: ok }, file: { url: '/uploads/b.jpg' } });
        assert.strictEqual(r.code, 201, ok);
    }
});
test('AC-03 · tạo banner thiếu ảnh → 400; lỗi dữ liệu thì xóa luôn ảnh vừa tải lên (không để file mồ côi)', async () => {
    reset();
    assert.strictEqual((await call(content.createBanner, { user: ADMIN, body: { title: 'Có tiêu đề' } })).code, 400);
    const r = await call(content.createBanner, { user: ADMIN, body: { title: '' }, file: { url: '/uploads/orphan.jpg' } });
    assert.strictEqual(r.code, 400);
    assert.deepStrictEqual(removed, ['/uploads/orphan.jpg']);
    assert.strictEqual(Banner.docs.length, 0);
});
test('AC-04 · ngày kết thúc phải sau ngày bắt đầu', async () => {
    reset();
    const r = await call(content.createBanner, { user: ADMIN, body: { title: 'T', startsAt: '2026-12-10T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }, file: { url: '/uploads/b.jpg' } });
    assert.strictEqual(r.code, 400);
    assert.deepStrictEqual(removed, ['/uploads/b.jpg']);
});
test('AC-05 · sửa banner đổi ảnh → xóa ảnh cũ; xóa banner → xóa ảnh; multipart "false" tắt banner', async () => {
    reset();
    const b = (await call(content.createBanner, { user: ADMIN, body: { title: 'Khuyến mãi' }, file: { url: '/uploads/old.jpg' } })).body.banner;
    const r = await call(content.updateBanner, { user: ADMIN, params: { id: b._id }, body: { isActive: 'false' }, file: { url: '/uploads/new.jpg' } });
    assert.strictEqual(r.body.banner.imageUrl, '/uploads/new.jpg');
    assert.strictEqual(r.body.banner.isActive, false);
    assert.deepStrictEqual(removed, ['/uploads/old.jpg']);
    await call(content.deleteBanner, { user: ADMIN, params: { id: b._id } });
    assert.ok(removed.includes('/uploads/new.jpg'));
    assert.strictEqual((await call(content.updateBanner, { user: ADMIN, params: { id: 'xyz' }, body: {} })).code, 400);
});

// ── Tin tức ──
test('AC-06 · slug tiếng Việt không dấu, trùng tiêu đề thì thêm hậu tố; nháp chưa có ngày đăng, đăng ngay thì có', async () => {
    reset();
    const body = { title: 'Giải bóng đá Hà Nội 2026!', content: 'Nội dung bài viết đủ dài để hợp lệ.' };
    const a = (await call(content.createNews, { user: ADMIN, body })).body.article;
    const b = (await call(content.createNews, { user: ADMIN, body: { ...body, status: 'published' } })).body.article;
    assert.strictEqual(a.slug, 'giai-bong-da-ha-noi-2026');
    assert.strictEqual(b.slug, 'giai-bong-da-ha-noi-2026-2');
    assert.strictEqual(a.publishedAt, null);
    assert.ok(b.publishedAt instanceof Date);
    assert.strictEqual(a.authorId, ADMIN._id);
});
test('AC-07 · công khai: bản nháp không lộ (danh sách và theo slug), danh sách không kèm nội dung đầy đủ', async () => {
    reset();
    await News.create({ title: 'Nháp', slug: 'nhap', content: 'x'.repeat(30), status: 'draft' });
    await News.create({ title: 'Đã đăng', slug: 'da-dang', content: 'x'.repeat(30), status: 'published', publishedAt: new Date() });
    const list = await call(content.getPublicNews, {});
    assert.deepStrictEqual(list.body.news.map((n) => n.slug), ['da-dang']);
    assert.ok(!String(News.lastSelect.select).includes('content'));
    assert.strictEqual((await call(content.getPublicNewsBySlug, { params: { slug: 'nhap' } })).code, 404);
    assert.strictEqual((await call(content.getPublicNewsBySlug, { params: { slug: 'DA-DANG' } })).code, 200);
});
test('AC-08 · kiểm tra nội dung bài viết; đăng lần đầu mới ghi ngày đăng, đăng lại không đổi; gỡ ảnh bìa xóa file', async () => {
    reset();
    assert.strictEqual((await call(content.createNews, { user: ADMIN, body: { title: 'abc', content: 'x'.repeat(30) } })).code, 400);
    assert.strictEqual((await call(content.createNews, { user: ADMIN, body: { title: 'Tiêu đề hợp lệ', content: 'ngắn' } })).code, 400);
    assert.strictEqual((await call(content.createNews, { user: ADMIN, body: { title: 'Tiêu đề hợp lệ', content: 'x'.repeat(30), status: 'hack' } })).code, 400);
    const a = (await call(content.createNews, { user: ADMIN, body: { title: 'Bài có ảnh bìa', content: 'x'.repeat(30) }, file: { url: '/uploads/cover.jpg' } })).body.article;
    await call(content.updateNews, { user: ADMIN, params: { id: a._id }, body: { status: 'published' } });
    const first = News.docs[0].publishedAt;
    assert.ok(first instanceof Date);
    await call(content.updateNews, { user: ADMIN, params: { id: a._id }, body: { status: 'draft' } });
    await call(content.updateNews, { user: ADMIN, params: { id: a._id }, body: { status: 'published', removeCover: 'true' } });
    assert.strictEqual(News.docs[0].publishedAt, first);
    assert.strictEqual(News.docs[0].coverImage, '');
    assert.ok(removed.includes('/uploads/cover.jpg'));
});

// ── Chính sách ──
test('AC-09 · chính sách: mã hợp lệ, không trùng, cần ít nhất một mục đủ tiêu đề + nội dung; mã cố định khi sửa; nháp không công khai', async () => {
    reset();
    const sections = [{ title: '1. Hủy sân', body: 'Hủy trước 24 giờ được hoàn 100%.' }];
    assert.strictEqual((await call(content.createPolicy, { user: ADMIN, body: { key: 'Bad Key!', title: 'Chính sách hủy', sections } })).code, 400);
    assert.strictEqual((await call(content.createPolicy, { user: ADMIN, body: { key: 'cancellation', title: 'Chính sách hủy', sections: [] } })).code, 400);
    assert.strictEqual((await call(content.createPolicy, { user: ADMIN, body: { key: 'cancellation', title: 'Chính sách hủy', sections: [{ title: 'Chỉ tiêu đề', body: '' }] } })).code, 400);
    const p = (await call(content.createPolicy, { user: ADMIN, body: { key: 'cancellation', title: 'Chính sách hủy', sections } })).body.policy;
    assert.strictEqual((await call(content.createPolicy, { user: ADMIN, body: { key: 'cancellation', title: 'Trùng', sections } })).code, 409);
    await call(content.updatePolicy, { user: ADMIN, params: { id: p._id }, body: { key: 'doi-ma', title: 'Tiêu đề mới', isPublished: false } });
    assert.strictEqual(Policy.docs[0].key, 'cancellation');
    assert.strictEqual(Policy.docs[0].title, 'Tiêu đề mới');
    assert.strictEqual((await call(content.getPublicPolicy, { params: { key: 'cancellation' } })).code, 404);
    await call(content.updatePolicy, { user: ADMIN, params: { id: p._id }, body: { isPublished: true } });
    assert.strictEqual((await call(content.getPublicPolicy, { params: { key: 'CANCELLATION' } })).code, 200);
    assert.strictEqual((await call(content.deletePolicy, { user: ADMIN, params: { id: p._id } })).code, 200);
});

// ── Danh mục môn ──
test('AC-10 · danh mục môn tự nạp 8 môn mặc định khi trống (một lần), công khai trả đủ kèm isActive', async () => {
    reset();
    const r = await call(sports.getPublicSports, {});
    assert.strictEqual(r.body.sports.length, DEFAULTS.length);
    assert.deepStrictEqual(r.body.sports.map((s) => s.id), DEFAULTS.map((d) => d.key));
    await call(sports.getPublicSports, {});
    assert.strictEqual(SportCategory.docs.length, DEFAULTS.length);
});
test('AC-11 · tạo môn: mã/màu/tên hợp lệ, không trùng mã; sửa không đổi mã', async () => {
    reset();
    const ok = { key: 'pickleball', name: 'Pickleball', icon: '🏓', color: '#12ab34' };
    assert.strictEqual((await call(sports.createCategory, { body: { ...ok, key: 'Bad Key' } })).code, 400);
    assert.strictEqual((await call(sports.createCategory, { body: { ...ok, color: 'red' } })).code, 400);
    assert.strictEqual((await call(sports.createCategory, { body: { ...ok, name: 'x' } })).code, 400);
    const c = (await call(sports.createCategory, { body: ok })).body.category;
    assert.strictEqual(c.order, DEFAULTS.length);
    assert.strictEqual((await call(sports.createCategory, { body: ok })).code, 409);
    await call(sports.updateCategory, { params: { id: c._id }, body: { key: 'doi-ma', name: 'Pickleball VN', color: '#ff0000' } });
    const doc = SportCategory.docs.find((d) => d._id === c._id);
    assert.strictEqual(doc.key, 'pickleball');
    assert.strictEqual(doc.name, 'Pickleball VN');
    assert.strictEqual(doc.color, '#FF0000');
});
test('AC-12 · không xóa môn đang được địa điểm/sân dùng (409) — xóa được khi không dùng', async () => {
    reset();
    await call(sports.getPublicSports, {});
    await Venue.create({ name: 'Sân A', sports: ['football'] });
    const football = SportCategory.docs.find((d) => d.key === 'football');
    const yoga = SportCategory.docs.find((d) => d.key === 'yoga');
    // controller đếm bằng Venue.countDocuments({ sports: key }) — kho giả so khớp mảng bằng chuỗi nên mô phỏng thêm dạng đơn
    await Venue.create({ name: 'Sân B', sports: 'football' });
    assert.strictEqual((await call(sports.deleteCategory, { params: { id: football._id } })).code, 409);
    assert.strictEqual((await call(sports.deleteCategory, { params: { id: yoga._id } })).code, 200);
    assert.ok(!SportCategory.docs.some((d) => d.key === 'yoga'));
});
test('AC-13 · checkSport: môn lạ bị chặn; môn đã tắt không nhận sân mới nhưng sân cũ vẫn sửa được', async () => {
    reset();
    await call(sports.getPublicSports, {});
    assert.ok(await checkSport('khong-ton-tai'));
    assert.strictEqual(await checkSport('football'), null);
    SportCategory.docs.find((d) => d.key === 'tennis').isActive = false;
    assert.ok(await checkSport('tennis'));
    assert.strictEqual(await checkSport('tennis', 'tennis'), null);
});

// ── Đổi vai trò ──
function seedUsers() {
    reset();
    return Promise.all([
        User.create({ _id: oid(10), name: 'Khách', role: 'customer', status: 'active', toSafeObject() { return { _id: this._id, role: this.role }; } }),
        User.create({ _id: oid(11), name: 'Chủ sân', role: 'owner', status: 'verified', toSafeObject() { return { _id: this._id, role: this.role }; } }),
        User.create({ _id: oid(12), name: 'Admin khác', role: 'admin', status: 'active', toSafeObject() { return {}; } }),
        User.create({ _id: oid(13), name: 'Bị khóa', role: 'customer', status: 'banned', toSafeObject() { return {}; } }),
    ]);
}
const role = (id, r, reason = 'Đã xác minh giấy phép kinh doanh') => call(users.changeUserRole, { user: ADMIN, params: { id }, body: { role: r, reason } });
test('AC-14 · đổi vai trò: kiểm tra đầu vào, không tự đổi mình, không đổi admin, không đổi tài khoản bị khóa, không đổi sang vai trò đang có', async () => {
    await seedUsers();
    assert.strictEqual((await role(oid(10), 'admin')).code, 400);
    assert.strictEqual((await role(oid(10), 'owner', 'ok')).code, 400);
    assert.strictEqual((await role(oid(999), 'owner')).code, 404);
    assert.strictEqual((await call(users.changeUserRole, { user: { _id: oid(10), role: 'admin' }, params: { id: oid(10) }, body: { role: 'owner', reason: 'Tự nâng quyền' } })).code, 403);
    assert.strictEqual((await role(oid(12), 'customer')).code, 403);
    assert.strictEqual((await role(oid(13), 'owner')).code, 409);
    assert.strictEqual((await role(oid(10), 'customer')).code, 409);
});
test('AC-15 · khách → chủ sân: cấp quyền, ghi người đổi, thông báo kèm lý do, trả lại địa điểm từng bị ẩn do mất quyền', async () => {
    await seedUsers();
    await Venue.create({ _id: oid(30), ownerId: oid(10), isActive: false, suspendedByOwnerBan: true });
    await Venue.create({ _id: oid(31), ownerId: oid(10), isActive: false, suspendedByOwnerBan: false }); // admin tạm ngưng riêng — không được bật lại
    const r = await role(oid(10), 'owner', 'Đã xác minh giấy phép kinh doanh');
    assert.strictEqual(r.body.user.role, 'owner');
    const u = User.docs.find((d) => d._id === oid(10));
    assert.deepStrictEqual([u.status, u.ownerApplicationStatus, u.roleChangedBy], ['verified', 'approved', ADMIN._id]);
    assert.ok(u.roleChangedAt instanceof Date);
    assert.strictEqual(Venue.docs.find((d) => d._id === oid(30)).isActive, true);
    assert.strictEqual(Venue.docs.find((d) => d._id === oid(31)).isActive, false);
    assert.ok(Notification.docs.some((n) => n.userId === oid(10) && n.message.includes('giấy phép kinh doanh')));
});
test('AC-16 · chủ sân → khách: chặn khi còn lượt đặt chưa diễn ra; được khi không còn — ẩn địa điểm và thông báo', async () => {
    await seedUsers();
    await Venue.create({ _id: oid(40), ownerId: oid(11) });
    const future = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10);
    await Booking.create({ venueId: oid(40), status: 'confirmed', date: future });
    const blocked = await role(oid(11), 'customer', 'Vi phạm quy định nhiều lần');
    assert.strictEqual(blocked.code, 409);
    assert.strictEqual(User.docs.find((d) => d._id === oid(11)).role, 'owner');
    Booking.docs = [];
    await Booking.create({ venueId: oid(40), status: 'completed', date: past });
    await Booking.create({ venueId: oid(40), status: 'cancelled', date: future });
    const ok = await role(oid(11), 'customer', 'Vi phạm quy định nhiều lần');
    assert.strictEqual(ok.code, 200);
    const u = User.docs.find((d) => d._id === oid(11));
    assert.deepStrictEqual([u.role, u.status, u.ownerApplicationStatus], ['customer', 'active', 'none']);
    const v = Venue.docs.find((d) => d._id === oid(40));
    assert.deepStrictEqual([v.isActive, v.suspendedByOwnerBan], [false, true]);
    assert.ok(Notification.docs.some((n) => n.userId === oid(11) && /tạm ẩn/.test(n.message)));
});

// ── Tiện ích & định tuyến ──
test('AC-17 · slugify: bỏ dấu, đ→d, ký tự lạ thành gạch ngang, giới hạn độ dài, không gạch đầu/cuối', async () => {
    assert.strictEqual(slugify('  Đặt sân Cầu lông: Ưu đãi 50%!!  '), 'dat-san-cau-long-uu-dai-50');
    assert.strictEqual(slugify('???'), '');
    assert.ok(slugify('a'.repeat(200)).length <= 80);
});
test('AC-18 · định tuyến: công khai không cần đăng nhập, quản trị nằm sau authorize(admin) + giới hạn tần suất; sân dùng danh mục động', async () => {
    const root = path.join(__dirname, '..');
    const pub = fs.readFileSync(path.join(root, 'routes', 'contentRoutes.js'), 'utf8');
    for (const f of ["'/banners'", "'/news'", "'/news/:slug'", "'/policies'", "'/policies/:key'", "'/sports'"]) assert.ok(pub.includes(f), f);
    assert.ok(!pub.includes('protect'), 'route công khai không được bắt đăng nhập');
    const ar = fs.readFileSync(path.join(root, 'routes', 'adminRoutes.js'), 'utf8');
    const gate = ar.indexOf("router.use(protect, authorize('admin'))");
    for (const f of ["'/users/:id/role'", "'/banners'", "'/news'", "'/policies'", "'/sport-categories'"]) { assert.ok(ar.indexOf(f) > gate, f); }
    assert.ok(/router\.patch\('\/users\/:id\/role', writeLimiter/.test(ar));
    assert.ok(fs.readFileSync(path.join(root, 'server.js'), 'utf8').includes("require('./routes/contentRoutes')"));
    const court = fs.readFileSync(path.join(root, 'controllers', 'courtController.js'), 'utf8');
    assert.ok(court.includes('checkSport') && !court.includes('SPORT_IDS'));
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
