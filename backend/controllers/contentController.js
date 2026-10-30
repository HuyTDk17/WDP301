const mongoose = require('mongoose');
const Banner = require('../models/Banner');
const News = require('../models/News');
const Policy = require('../models/Policy');
const asyncHandler = require('../utils/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');
const slugify = require('../utils/slugify');
const { fileUrl, removeStoredFile } = require('../utils/uploads');

const isId = (v) => mongoose.isValidObjectId(v);
// multipart gửi mọi giá trị dạng chuỗi
const toBool = (v, fallback = true) => (v === undefined ? fallback : !['false', '0', ''].includes(String(v)));
const toDate = (v) => {
    if (v === undefined) return undefined;          // không gửi → giữ nguyên
    if (v === null || v === '') return null;        // gửi rỗng → xóa mốc
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? false : d;   // false = không hợp lệ
};
const SAFE_LINK = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/i;

// ============================================================
// BANNER
// ============================================================

// @route GET /api/banners  (công khai) — chỉ banner đang bật và trong khung thời gian
exports.getPublicBanners = asyncHandler(async (req, res) => {
    const now = new Date();
    const banners = await Banner.find({
        isActive: true,
        $and: [
            { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
            { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
        ],
    }).sort({ order: 1, createdAt: -1 }).limit(10).select('title subtitle imageUrl linkUrl');
    res.json({ banners });
});

// @route GET /api/admin/banners
exports.getBannersAdmin = asyncHandler(async (req, res) => {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    res.json({ banners });
});

function readBannerFields(body, { partial }) {
    const out = {};
    if (body.title !== undefined || !partial) {
        const title = String(body.title || '').trim();
        if (!title) return { error: 'Vui lòng nhập tiêu đề banner' };
        if (title.length > 100) return { error: 'Tiêu đề banner tối đa 100 ký tự' };
        out.title = title;
    }
    if (body.subtitle !== undefined) {
        const v = String(body.subtitle).trim();
        if (v.length > 200) return { error: 'Mô tả banner tối đa 200 ký tự' };
        out.subtitle = v;
    }
    if (body.linkUrl !== undefined) {
        const v = String(body.linkUrl).trim();
        if (v && !SAFE_LINK.test(v)) return { error: 'Liên kết phải bắt đầu bằng "/" (trang trong web) hoặc http(s)://' };
        out.linkUrl = v;
    }
    if (body.order !== undefined) {
        const n = Number(body.order);
        if (!Number.isFinite(n)) return { error: 'Thứ tự phải là số' };
        out.order = n;
    }
    if (body.isActive !== undefined) out.isActive = toBool(body.isActive);
    for (const key of ['startsAt', 'endsAt']) {
        const d = toDate(body[key]);
        if (d === false) return { error: 'Ngày giờ không hợp lệ' };
        if (d !== undefined) out[key] = d;
    }
    return { fields: out };
}

// @route POST /api/admin/banners  (multipart: image)
exports.createBanner = asyncHandler(async (req, res) => {
    const { fields, error } = readBannerFields(req.body, { partial: false });
    if (error) { if (req.file) removeStoredFile(fileUrl(req.file)); return res.status(400).json({ message: error }); }
    if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn ảnh banner' });
    if (fields.startsAt && fields.endsAt && fields.endsAt <= fields.startsAt) {
        removeStoredFile(fileUrl(req.file));
        return res.status(400).json({ message: 'Ngày kết thúc phải sau ngày bắt đầu' });
    }
    const banner = await Banner.create({ ...fields, imageUrl: fileUrl(req.file) });
    res.status(201).json({ banner });
});

// @route PUT /api/admin/banners/:id  (multipart: image tùy chọn)
exports.updateBanner = asyncHandler(async (req, res) => {
    const discard = () => { if (req.file) removeStoredFile(fileUrl(req.file)); };
    if (!isId(req.params.id)) { discard(); return res.status(400).json({ message: 'Định dạng ID không hợp lệ' }); }
    const banner = await Banner.findById(req.params.id);
    if (!banner) { discard(); return res.status(404).json({ message: 'Không tìm thấy banner này' }); }
    const { fields, error } = readBannerFields(req.body, { partial: true });
    if (error) { discard(); return res.status(400).json({ message: error }); }

    const startsAt = fields.startsAt !== undefined ? fields.startsAt : banner.startsAt;
    const endsAt = fields.endsAt !== undefined ? fields.endsAt : banner.endsAt;
    if (startsAt && endsAt && endsAt <= startsAt) { discard(); return res.status(400).json({ message: 'Ngày kết thúc phải sau ngày bắt đầu' }); }

    const oldImage = banner.imageUrl;
    Object.assign(banner, fields);
    if (req.file) banner.imageUrl = fileUrl(req.file);
    await banner.save();
    if (req.file && oldImage) removeStoredFile(oldImage);
    res.json({ banner });
});

// @route DELETE /api/admin/banners/:id
exports.deleteBanner = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Không tìm thấy banner này' });
    if (banner.imageUrl) removeStoredFile(banner.imageUrl);
    res.json({ message: 'Đã xóa banner' });
});

// ============================================================
// TIN TỨC
// ============================================================

async function uniqueSlug(title) {
    const base = slugify(title) || 'bai-viet';
    let slug = base;
    for (let i = 2; await News.exists({ slug }); i += 1) slug = `${base}-${i}`;
    return slug;
}

function readNewsFields(body, { partial }) {
    const out = {};
    if (body.title !== undefined || !partial) {
        const title = String(body.title || '').trim();
        if (title.length < 5) return { error: 'Tiêu đề cần ít nhất 5 ký tự' };
        if (title.length > 150) return { error: 'Tiêu đề tối đa 150 ký tự' };
        out.title = title;
    }
    if (body.summary !== undefined) {
        const v = String(body.summary).trim();
        if (v.length > 300) return { error: 'Tóm tắt tối đa 300 ký tự' };
        out.summary = v;
    }
    if (body.content !== undefined || !partial) {
        const v = String(body.content || '').trim();
        if (v.length < 20) return { error: 'Nội dung cần ít nhất 20 ký tự' };
        if (v.length > 20000) return { error: 'Nội dung tối đa 20.000 ký tự' };
        out.content = v;
    }
    if (body.status !== undefined) {
        if (!['draft', 'published'].includes(body.status)) return { error: 'Trạng thái không hợp lệ' };
        out.status = body.status;
    }
    return { fields: out };
}

// @route GET /api/news?page=&limit=  (công khai) — chỉ bài đã đăng, không kèm nội dung đầy đủ
exports.getPublicNews = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const filter = { status: 'published' };
    const [total, news] = await Promise.all([
        News.countDocuments(filter),
        News.find(filter).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit).select('title slug summary coverImage publishedAt'),
    ]);
    res.json({ news, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// @route GET /api/news/:slug  (công khai) — bản nháp trả 404 như chưa từng tồn tại
exports.getPublicNewsBySlug = asyncHandler(async (req, res) => {
    const article = await News.findOne({ slug: String(req.params.slug).toLowerCase(), status: 'published' }).select('-authorId');
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết này' });
    res.json({ article });
});

// @route GET /api/admin/news?status=&search=&page=&limit=
exports.getNewsAdmin = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const filter = {};
    if (['draft', 'published'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.search && req.query.search.trim()) filter.title = new RegExp(escapeRegex(req.query.search.trim()), 'i');
    const [total, news] = await Promise.all([
        News.countDocuments(filter),
        News.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-content'),
    ]);
    res.json({ news, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// @route GET /api/admin/news/:id  (kèm nội dung để sửa)
exports.getNewsByIdAdmin = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const article = await News.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết này' });
    res.json({ article });
});

// @route POST /api/admin/news  (multipart: coverImage tùy chọn)
exports.createNews = asyncHandler(async (req, res) => {
    const { fields, error } = readNewsFields(req.body, { partial: false });
    if (error) { if (req.file) removeStoredFile(fileUrl(req.file)); return res.status(400).json({ message: error }); }
    const article = await News.create({
        ...fields,
        slug: await uniqueSlug(fields.title),
        coverImage: req.file ? fileUrl(req.file) : '',
        authorId: req.user._id,
        publishedAt: fields.status === 'published' ? new Date() : null,
    });
    res.status(201).json({ article });
});

// @route PUT /api/admin/news/:id  (multipart; removeCover=true để gỡ ảnh bìa)
exports.updateNews = asyncHandler(async (req, res) => {
    const discard = () => { if (req.file) removeStoredFile(fileUrl(req.file)); };
    if (!isId(req.params.id)) { discard(); return res.status(400).json({ message: 'Định dạng ID không hợp lệ' }); }
    const article = await News.findById(req.params.id);
    if (!article) { discard(); return res.status(404).json({ message: 'Không tìm thấy bài viết này' }); }
    const { fields, error } = readNewsFields(req.body, { partial: true });
    if (error) { discard(); return res.status(400).json({ message: error }); }

    const oldCover = article.coverImage;
    Object.assign(article, fields);
    // Lần ĐẦU đăng mới ghi publishedAt; chuyển về nháp rồi đăng lại không làm bài "nhảy" lên đầu danh sách.
    if (fields.status === 'published' && !article.publishedAt) article.publishedAt = new Date();
    if (req.file) article.coverImage = fileUrl(req.file);
    else if (toBool(req.body.removeCover, false)) article.coverImage = '';
    await article.save();
    if (oldCover && oldCover !== article.coverImage) removeStoredFile(oldCover);
    res.json({ article });
});

// @route DELETE /api/admin/news/:id
exports.deleteNews = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const article = await News.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết này' });
    if (article.coverImage) removeStoredFile(article.coverImage);
    res.json({ message: 'Đã xóa bài viết' });
});

// ============================================================
// CHÍNH SÁCH
// ============================================================

function readPolicyFields(body, { partial }) {
    const out = {};
    if (body.title !== undefined || !partial) {
        const title = String(body.title || '').trim();
        if (title.length < 3) return { error: 'Tiêu đề cần ít nhất 3 ký tự' };
        if (title.length > 150) return { error: 'Tiêu đề tối đa 150 ký tự' };
        out.title = title;
    }
    if (body.intro !== undefined) {
        const v = String(body.intro).trim();
        if (v.length > 1000) return { error: 'Đoạn mở đầu tối đa 1000 ký tự' };
        out.intro = v;
    }
    if (body.sections !== undefined || !partial) {
        if (!Array.isArray(body.sections) || body.sections.length === 0) return { error: 'Cần ít nhất một mục nội dung' };
        if (body.sections.length > 30) return { error: 'Tối đa 30 mục' };
        const sections = [];
        for (const s of body.sections) {
            const title = String(s?.title || '').trim();
            const text = String(s?.body || '').trim();
            if (!title || !text) return { error: 'Mỗi mục cần có cả tiêu đề và nội dung' };
            if (title.length > 150 || text.length > 5000) return { error: 'Tiêu đề mục tối đa 150 ký tự, nội dung mục tối đa 5000 ký tự' };
            sections.push({ title, body: text });
        }
        out.sections = sections;
    }
    if (body.isPublished !== undefined) out.isPublished = toBool(body.isPublished);
    return { fields: out };
}

// @route GET /api/policies  (công khai) — danh sách trang đã đăng
exports.getPublicPolicies = asyncHandler(async (req, res) => {
    const policies = await Policy.find({ isPublished: true }).sort({ title: 1 }).select('key title updatedAt');
    res.json({ policies });
});

// @route GET /api/policies/:key  (công khai)
exports.getPublicPolicy = asyncHandler(async (req, res) => {
    const policy = await Policy.findOne({ key: String(req.params.key).toLowerCase(), isPublished: true }).select('-updatedBy');
    if (!policy) return res.status(404).json({ message: 'Không tìm thấy trang chính sách này' });
    res.json({ policy });
});

// @route GET /api/admin/policies
exports.getPoliciesAdmin = asyncHandler(async (req, res) => {
    const policies = await Policy.find().sort({ key: 1 });
    res.json({ policies });
});

// @route POST /api/admin/policies   body: { key, title, intro, sections[], isPublished }
exports.createPolicy = asyncHandler(async (req, res) => {
    const key = String(req.body.key || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(key)) return res.status(400).json({ message: 'Mã trang chỉ gồm chữ thường, số, dấu gạch ngang (2–40 ký tự)' });
    const { fields, error } = readPolicyFields(req.body, { partial: false });
    if (error) return res.status(400).json({ message: error });
    if (await Policy.exists({ key })) return res.status(409).json({ message: 'Mã trang này đã tồn tại' });
    const policy = await Policy.create({ ...fields, key, updatedBy: req.user._id });
    res.status(201).json({ policy });
});

// @route PUT /api/admin/policies/:id  (không đổi key để đường dẫn công khai ổn định)
exports.updatePolicy = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const policy = await Policy.findById(req.params.id);
    if (!policy) return res.status(404).json({ message: 'Không tìm thấy trang chính sách này' });
    const { fields, error } = readPolicyFields(req.body, { partial: true });
    if (error) return res.status(400).json({ message: error });
    Object.assign(policy, fields, { updatedBy: req.user._id });
    await policy.save();
    res.json({ policy });
});

// @route DELETE /api/admin/policies/:id  — xóa bản tùy chỉnh thì trang 'privacy'/'terms' quay về nội dung mặc định
exports.deletePolicy = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const policy = await Policy.findByIdAndDelete(req.params.id);
    if (!policy) return res.status(404).json({ message: 'Không tìm thấy trang chính sách này' });
    res.json({ message: 'Đã xóa trang chính sách' });
});
