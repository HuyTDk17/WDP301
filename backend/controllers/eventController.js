const mongoose = require('mongoose');
const Event = require('../models/Event');
const Venue = require('../models/Venue');
const asyncHandler = require('../utils/asyncHandler');
const settlementService = require('../services/settlementService');
const { fileUrl, removeStoredFile } = require('../utils/uploads');

const isId = (v) => mongoose.isValidObjectId(v);
const TYPES = ['tournament', 'promotion', 'other'];
const DAY = 24 * 60 * 60 * 1000;
const MAX_DURATION_MS = 90 * DAY;      // một sự kiện kéo dài tối đa 90 ngày
const MAX_ADVANCE_MS = 365 * DAY;      // chỉ tạo trước tối đa 1 năm
const MAX_ACTIVE_PER_OWNER = 20;       // chống spam: tối đa 20 sự kiện chưa kết thúc / chủ sân

/** Trạng thái suy ra: upcoming | ongoing | ended | cancelled. */
function phaseOf(event, now = new Date()) {
    if (event.status === 'cancelled') return 'cancelled';
    if (new Date(event.endsAt) < now) return 'ended';
    if (new Date(event.startsAt) > now) return 'upcoming';
    return 'ongoing';
}
const withPhase = (e) => ({ ...(e.toObject ? e.toObject() : e), phase: phaseOf(e) });

/** Điều kiện Mongo ứng với từng phase (dùng cho bộ lọc danh sách của chủ sân). */
function phaseFilter(phase, now = new Date()) {
    switch (phase) {
        case 'upcoming': return { status: 'scheduled', startsAt: { $gt: now } };
        case 'ongoing': return { status: 'scheduled', startsAt: { $lte: now }, endsAt: { $gte: now } };
        case 'ended': return { status: 'scheduled', endsAt: { $lt: now } };
        case 'cancelled': return { status: 'cancelled' };
        default: return {};
    }
}

/** Các địa điểm đang hiển thị công khai — cùng điều kiện với danh sách địa điểm (đã duyệt, đang bật, chủ sân không bị khóa phí). */
async function visibleVenueIds(extra = {}) {
    const blocked = await settlementService.blockedOwnerIds();
    const filter = { status: 'approved', isActive: true, ...extra };
    if (blocked.length) filter.ownerId = { $nin: blocked };
    return Venue.distinct('_id', filter);
}

const parseDate = (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? false : d;
};

/**
 * Đọc & kiểm tra dữ liệu sự kiện. `existing` có giá trị khi sửa.
 * Trả về { fields } hoặc { error }.
 */
function readFields(body, existing, now = new Date()) {
    const out = {};
    if (!existing || body.title !== undefined) {
        const title = String(body.title || '').trim();
        if (title.length < 5) return { error: 'Tên sự kiện cần ít nhất 5 ký tự' };
        if (title.length > 120) return { error: 'Tên sự kiện tối đa 120 ký tự' };
        out.title = title;
    }
    if (body.type !== undefined) {
        if (!TYPES.includes(body.type)) return { error: 'Loại sự kiện không hợp lệ' };
        out.type = body.type;
    }
    if (!existing || body.description !== undefined) {
        const description = String(body.description || '').trim();
        if (description.length < 20) return { error: 'Mô tả cần ít nhất 20 ký tự' };
        if (description.length > 3000) return { error: 'Mô tả tối đa 3000 ký tự' };
        out.description = description;
    }
    if (body.highlight !== undefined) {
        const h = String(body.highlight).trim();
        if (h.length > 60) return { error: 'Dòng nổi bật tối đa 60 ký tự' };
        out.highlight = h;
    }
    if (body.price !== undefined && body.price !== '') {
        const n = Number(body.price);
        if (!Number.isInteger(n) || n < 0 || n > 100000000) return { error: 'Phí tham gia phải là số nguyên từ 0 đến 100.000.000đ' };
        out.price = n;
    }

    const startsAt = parseDate(body.startsAt);
    const endsAt = parseDate(body.endsAt);
    if (startsAt === false || endsAt === false) return { error: 'Ngày giờ không hợp lệ' };
    if (!existing && (!startsAt || !endsAt)) return { error: 'Vui lòng chọn thời gian bắt đầu và kết thúc' };
    if (startsAt) out.startsAt = startsAt;
    if (endsAt) out.endsAt = endsAt;

    const effStart = out.startsAt || existing?.startsAt;
    const effEnd = out.endsAt || existing?.endsAt;
    if (effEnd <= effStart) return { error: 'Thời gian kết thúc phải sau thời gian bắt đầu' };
    if (effEnd - effStart > MAX_DURATION_MS) return { error: 'Một sự kiện kéo dài tối đa 90 ngày' };
    // Mốc bắt đầu chỉ cần ở tương lai khi tạo mới hoặc khi bị đổi (sự kiện đang diễn ra vẫn sửa được nội dung).
    const startChanged = out.startsAt && (!existing || out.startsAt.getTime() !== new Date(existing.startsAt).getTime());
    if (startChanged && out.startsAt <= now) return { error: 'Thời gian bắt đầu phải ở tương lai' };
    if (startChanged && out.startsAt - now > MAX_ADVANCE_MS) return { error: 'Chỉ tạo sự kiện trước tối đa 1 năm' };
    return { fields: out };
}

// ============================================================
// CÔNG KHAI
// ============================================================

// @route GET /api/events?venueId=&type=&page=&limit=   — sự kiện chưa kết thúc, chưa hủy, ở địa điểm đang hiển thị
exports.listPublicEvents = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const { venueId, type } = req.query;
    if (venueId && !isId(venueId)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });

    const ids = await visibleVenueIds(venueId ? { _id: venueId } : {});
    const filter = { status: 'scheduled', endsAt: { $gte: new Date() }, venueId: { $in: ids } };
    if (TYPES.includes(type)) filter.type = type;

    const [total, events] = await Promise.all([
        Event.countDocuments(filter),
        Event.find(filter).populate('venueId', 'name address images').sort({ startsAt: 1 }).skip((page - 1) * limit).limit(limit).select('-ownerId -cancelReason'),
    ]);
    res.json({ events: events.map(withPhase), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// @route GET /api/events/:id — hiển thị cả sự kiện đã hủy/đã kết thúc để link đã chia sẻ vẫn cho biết tình trạng
exports.getPublicEvent = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const event = await Event.findById(req.params.id).populate('venueId', 'name address images').select('-ownerId -cancelReason');
    const visible = event ? await visibleVenueIds({ _id: event.venueId?._id || event.venueId }) : [];
    if (!event || visible.length === 0) return res.status(404).json({ message: 'Không tìm thấy sự kiện này' });
    res.json({ event: withPhase(event) });
});

// ============================================================
// CHỦ SÂN
// ============================================================

// @route GET /api/owner/events?phase=upcoming|ongoing|ended|cancelled
exports.getOwnerEvents = asyncHandler(async (req, res) => {
    const filter = { ownerId: req.user._id, ...phaseFilter(req.query.phase) };
    const events = await Event.find(filter).sort({ startsAt: -1 }).limit(200);
    res.json({ events: events.map(withPhase) });
});

// @route POST /api/owner/events   (multipart: image tùy chọn)
exports.createEvent = asyncHandler(async (req, res) => {
    const discard = () => { if (req.file) removeStoredFile(fileUrl(req.file)); };
    const venueId = req.body.venueId;
    if (!isId(venueId)) { discard(); return res.status(400).json({ message: 'Vui lòng chọn địa điểm tổ chức' }); }
    // Chỉ tạo sự kiện ở địa điểm CỦA MÌNH.
    const venue = await Venue.findOne({ _id: venueId, ownerId: req.user._id });
    if (!venue) { discard(); return res.status(404).json({ message: 'Không tìm thấy địa điểm này trong tài khoản của bạn' }); }

    const { fields, error } = readFields(req.body, null);
    if (error) { discard(); return res.status(400).json({ message: error }); }

    const active = await Event.countDocuments({ ownerId: req.user._id, status: 'scheduled', endsAt: { $gte: new Date() } });
    if (active >= MAX_ACTIVE_PER_OWNER) {
        discard();
        return res.status(429).json({ message: `Bạn đang có ${MAX_ACTIVE_PER_OWNER} sự kiện chưa kết thúc. Hãy hủy hoặc chờ kết thúc bớt trước khi tạo thêm.` });
    }

    const event = await Event.create({ ...fields, ownerId: req.user._id, venueId: venue._id, venueName: venue.name, imageUrl: req.file ? fileUrl(req.file) : '' });
    res.status(201).json({ event: withPhase(event) });
});

// @route PUT /api/owner/events/:id   (multipart; removeImage=true để gỡ ảnh)
exports.updateEvent = asyncHandler(async (req, res) => {
    const discard = () => { if (req.file) removeStoredFile(fileUrl(req.file)); };
    if (!isId(req.params.id)) { discard(); return res.status(400).json({ message: 'Định dạng ID không hợp lệ' }); }
    // Điều kiện sở hữu nằm ngay trong truy vấn — không lộ sự kiện của chủ sân khác.
    const event = await Event.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!event) { discard(); return res.status(404).json({ message: 'Không tìm thấy sự kiện này' }); }
    const phase = phaseOf(event);
    if (phase === 'cancelled') { discard(); return res.status(409).json({ message: 'Sự kiện đã hủy, không thể chỉnh sửa' }); }
    if (phase === 'ended') { discard(); return res.status(409).json({ message: 'Sự kiện đã kết thúc, không thể chỉnh sửa' }); }

    const { fields, error } = readFields(req.body, event);
    if (error) { discard(); return res.status(400).json({ message: error }); }

    if (req.body.venueId !== undefined && String(req.body.venueId) !== String(event.venueId)) {
        if (!isId(req.body.venueId)) { discard(); return res.status(400).json({ message: 'Địa điểm không hợp lệ' }); }
        const venue = await Venue.findOne({ _id: req.body.venueId, ownerId: req.user._id });
        if (!venue) { discard(); return res.status(404).json({ message: 'Không tìm thấy địa điểm này trong tài khoản của bạn' }); }
        fields.venueId = venue._id;
        fields.venueName = venue.name;
    }

    const oldImage = event.imageUrl;
    Object.assign(event, fields);
    if (req.file) event.imageUrl = fileUrl(req.file);
    else if (['true', '1'].includes(String(req.body.removeImage))) event.imageUrl = '';
    await event.save();
    if (oldImage && oldImage !== event.imageUrl) removeStoredFile(oldImage);
    res.json({ event: withPhase(event) });
});

// @route POST /api/owner/events/:id/cancel   body: { reason }
exports.cancelEvent = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 5) return res.status(400).json({ message: 'Vui lòng nhập lý do hủy (ít nhất 5 ký tự)' });
    if (reason.length > 500) return res.status(400).json({ message: 'Lý do tối đa 500 ký tự' });

    const event = await Event.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!event) return res.status(404).json({ message: 'Không tìm thấy sự kiện này' });
    const phase = phaseOf(event);
    if (phase === 'cancelled') return res.status(409).json({ message: 'Sự kiện này đã được hủy trước đó' });
    if (phase === 'ended') return res.status(409).json({ message: 'Sự kiện đã kết thúc, không thể hủy' });

    event.status = 'cancelled';
    event.cancelReason = reason;
    event.cancelledAt = new Date();
    await event.save();
    res.json({ event: withPhase(event) });
});

exports._phaseOf = phaseOf;
