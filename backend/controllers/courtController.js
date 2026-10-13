const Court = require('../models/Court');
const Venue = require('../models/Venue');
const asyncHandler = require('../utils/asyncHandler');
const { checkSport } = require('../utils/sportCategories');

async function assertOwnsVenue(venueId, ownerId) {
    const venue = await Venue.findById(venueId);
    if (!venue) { const err = new Error('Không tìm thấy địa điểm này'); err.statusCode = 404; throw err; }
    if (venue.ownerId.toString() !== ownerId.toString()) {
        const err = new Error('Bạn không có quyền với địa điểm này'); err.statusCode = 403; throw err;
    }
    return venue;
}

exports.getOwnerCourts = asyncHandler(async (req, res) => {
    const venues = await Venue.find({ ownerId: req.user._id }).select('_id name');
    const venueIds = venues.map((v) => v._id);
    const courts = await Court.find({ venueId: { $in: venueIds } }).sort({ createdAt: -1 });
    const venueMap = Object.fromEntries(venues.map((v) => [v._id.toString(), v.name]));
    const result = courts.map((c) => ({ ...c.toObject(), venueName: venueMap[c.venueId.toString()] || '' }));
    res.json({ courts: result });
});

/** Chỉ nhận các trường chủ sân được phép sửa (không cho ghi đè venueId/status... qua body) và kiểm tra giá trị. */
function pickCourtFields(body = {}) {
    const out = {};
    for (const k of ['name', 'type', 'size', 'surface', 'pricePerHour']) {
        if (body[k] !== undefined) out[k] = body[k];
    }
    return { fields: out };
}

exports.createCourt = asyncHandler(async (req, res) => {
    await assertOwnsVenue(req.params.venueId, req.user._id);
    const { fields, error } = pickCourtFields(req.body);
    if (error) return res.status(400).json({ message: error });
    // Môn do Admin quản lý (danh mục động); môn đã tắt không nhận sân mới.
    const sportError = fields.type !== undefined ? await checkSport(fields.type) : null;
    if (sportError) return res.status(400).json({ message: sportError });
    const court = await Court.create({ ...fields, venueId: req.params.venueId });
    res.status(201).json({ court });
});

exports.updateCourt = asyncHandler(async (req, res) => {
    await assertOwnsVenue(req.params.venueId, req.user._id);
    const { fields, error } = pickCourtFields(req.body);
    if (error) return res.status(400).json({ message: error });
    if (fields.type !== undefined) {
        const current = await Court.findOne({ _id: req.params.courtId, venueId: req.params.venueId }).select('type');
        if (!current) return res.status(404).json({ message: 'Không tìm thấy sân này' });
        // Sân đang dùng một môn đã tắt vẫn sửa được nếu không đổi môn.
        const sportError = await checkSport(fields.type, current.type);
        if (sportError) return res.status(400).json({ message: sportError });
    }
    const court = await Court.findOneAndUpdate({ _id: req.params.courtId, venueId: req.params.venueId }, fields, { new: true, runValidators: true });
    if (!court) return res.status(404).json({ message: 'Không tìm thấy sân này' });
    res.json({ court });
});

exports.updateCourtStatus = asyncHandler(async (req, res) => {
    await assertOwnsVenue(req.params.venueId, req.user._id);
    const court = await Court.findOneAndUpdate({ _id: req.params.courtId, venueId: req.params.venueId }, { status: req.body.status }, { new: true });
    if (!court) return res.status(404).json({ message: 'Không tìm thấy sân này' });
    res.json({ court });
});

exports.deleteCourt = asyncHandler(async (req, res) => {
    await assertOwnsVenue(req.params.venueId, req.user._id);
    const court = await Court.findOneAndDelete({ _id: req.params.courtId, venueId: req.params.venueId });
    if (!court) return res.status(404).json({ message: 'Không tìm thấy sân này' });
    res.json({ message: 'Đã xóa sân' });
});
