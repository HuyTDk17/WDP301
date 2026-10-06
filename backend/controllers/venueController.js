const Venue = require('../models/Venue');
const Court = require('../models/Court');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');
const { fileUrl, removeStoredFile } = require('../utils/uploads');
const settlementService = require('../services/settlementService');

// ============================================================
// API CÔNG KHAI
// ============================================================

// @route   GET /api/venues
// minPrice/maxPrice lọc theo GIÁ THẤP NHẤT trong các sân con đang hoạt động
// của từng venue — vì giá được đặt ở cấp Court, không phải Venue.
exports.getVenues = asyncHandler(async (req, res) => {
    const { sport, city, search, minPrice, maxPrice, minRating, page = 1, limit = 12, sort = 'relevance' } = req.query;

    const matchStage = { status: 'approved', isActive: true };
    // Chủ sân quá hạn nộp phí dịch vụ: địa điểm bị khoá, không hiện trên hệ thống
    const blocked = await settlementService.blockedOwnerIds();
    if (blocked.length) matchStage.ownerId = { $nin: blocked };
    if (sport) matchStage.sports = sport;
    if (city) matchStage['address.city'] = city;
    if (search) matchStage.name = { $regex: search, $options: 'i' };
    if (minRating) matchStage.rating = { $gte: Number(minRating) };

    const sortStage =
        sort === 'rating' ? { rating: -1 } :
        sort === 'price_asc' ? { minPricePerHour: 1 } :
        sort === 'price_desc' ? { minPricePerHour: -1 } :
        { createdAt: -1 };

    const priceMatch = {};
    if (minPrice) priceMatch.$gte = Number(minPrice);
    if (maxPrice) priceMatch.$lte = Number(maxPrice);

    const pipeline = [
        { $match: matchStage },
        {
            $lookup: {
                from: 'courts',
                let: { venueId: '$_id' },
                pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$venueId', '$$venueId'] }, { $eq: ['$status', 'active'] }] } } }],
                as: 'activeCourts',
            },
        },
        { $addFields: { minPricePerHour: { $min: '$activeCourts.pricePerHour' } } },
        { $project: { activeCourts: 0 } },
    ];

    if (Object.keys(priceMatch).length > 0) pipeline.push({ $match: { minPricePerHour: priceMatch } });
    pipeline.push({ $sort: sortStage });

    const countPipeline = [...pipeline, { $count: 'total' }];
    const dataPipeline = [...pipeline, { $skip: (Number(page) - 1) * Number(limit) }, { $limit: Number(limit) }];

    const [venues, countResult] = await Promise.all([Venue.aggregate(dataPipeline), Venue.aggregate(countPipeline)]);
    res.json({ venues, total: countResult[0]?.total || 0 });
});

// @route   GET /api/venues/featured
exports.getFeaturedVenues = asyncHandler(async (req, res) => {
    const blocked = await settlementService.blockedOwnerIds();
    const venues = await Venue.aggregate([
        { $match: { status: 'approved', isActive: true, ...(blocked.length ? { ownerId: { $nin: blocked } } : {}) } },
        {
            $lookup: {
                from: 'courts',
                let: { venueId: '$_id' },
                pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$venueId', '$$venueId'] }, { $eq: ['$status', 'active'] }] } } }],
                as: 'activeCourts',
            },
        },
        { $addFields: { minPricePerHour: { $min: '$activeCourts.pricePerHour' } } },
        { $project: { activeCourts: 0 } },
        { $sort: { rating: -1 } },
        { $limit: 6 },
    ]);
    res.json({ venues });
});

// @route   GET /api/venues/:id
exports.getVenueById = asyncHandler(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });

    // TRƯỚC ĐÂY: trang chi tiết công khai không lọc isActive/status, nên một
    // địa điểm đã bị admin ẩn (hoặc tự động ẩn vì chủ sân bị khóa — xem
    // userController.updateUserStatus) vẫn xem được đầy đủ nếu có link trực
    // tiếp. Chỉ chủ sân của chính địa điểm đó hoặc admin mới được xem khi nó
    // đang ẩn — người khác nhận 404 giống như địa điểm không tồn tại (không
    // tiết lộ là nó có tồn tại nhưng bị ẩn).
    const isVisible = venue.status === 'approved' && venue.isActive && !(await settlementService.isOwnerBlocked(venue.ownerId));
    const isOwnerOrAdmin = req.user && (req.user.role === 'admin' || String(venue.ownerId) === String(req.user._id));
    if (!isVisible && !isOwnerOrAdmin) {
        return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    }

    const courts = await Court.find({ venueId: venue._id });
    res.json({ venue: { ...venue.toObject(), courts } });
});

// @route   GET /api/venues/:id/slots?courtId=&date=
exports.getAvailableSlots = asyncHandler(async (req, res) => {
    const { date, courtId } = req.query;
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    // Đồng bộ với getVenueById — không hé lộ khung giờ của một địa điểm đang
    // ẩn. Không cần ngoại lệ cho chủ sân/admin: hai nhóm này không dùng route
    // công khai này để xem lịch của chính họ (họ có route riêng ở ownerRoutes).
    if (venue.status !== 'approved' || !venue.isActive || await settlementService.isOwnerBlocked(venue.ownerId)) {
        return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    }

    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    const filter = {
        venueId: venue._id, date,
        status: { $nin: ['cancelled', 'transferred'] },
        // Đơn chờ thanh toán quá 15 phút coi như đã bỏ dở, trả khung giờ về
        // trạng thái trống thay vì giữ vĩnh viễn như trước.
        $nor: [{ status: 'awaiting_payment', createdAt: { $lt: staleBefore } }],
    };
    if (courtId) filter.courtId = courtId;

    const bookings = await Booking.find(filter);
    res.json({ openHours: venue.openHours, bookedSlots: bookings.map((b) => ({ start: b.startTime, end: b.endTime, courtId: b.courtId })) });
});

// @route   GET /api/venues/:id/reviews
exports.getVenueReviews = asyncHandler(async (req, res) => {
    const reviews = await Review.find({ venueId: req.params.id }).populate('userId', 'name avatar').sort({ createdAt: -1 });
    res.json({ reviews, total: reviews.length });
});

// Dùng chung cho cả tạo VÀ xóa review — trước đây addReview tự tính lại rating
// nhưng không có hàm xóa review nào để tái sử dụng logic này.
async function recalculateVenueRating(venueId) {
    const allReviews = await Review.find({ venueId });
    const avg = allReviews.length ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length : 0;
    await Venue.findByIdAndUpdate(venueId, { rating: Math.round(avg * 10) / 10, reviewCount: allReviews.length });
}

// @route   POST /api/venues/:id/reviews
exports.addReview = asyncHandler(async (req, res) => {
    const { rating, comment } = req.body;
    if (!(rating >= 1 && rating <= 5)) {
        return res.status(400).json({ message: 'Điểm đánh giá phải từ 1 đến 5 sao' });
    }

    // Chỉ người ĐÃ THỰC SỰ dùng sân mới được đánh giá — trước đây bất kỳ ai
    // đăng nhập cũng spam đánh giá được, và spam bao nhiêu lần cũng được.
    const used = await Booking.findOne({
        venueId: req.params.id, customerId: req.user._id, status: 'completed',
    });
    if (!used) {
        return res.status(403).json({ message: 'Bạn cần hoàn tất ít nhất một lượt đặt tại địa điểm này trước khi đánh giá' });
    }
    const existing = await Review.findOne({ venueId: req.params.id, userId: req.user._id });
    if (existing) {
        return res.status(409).json({ message: 'Bạn đã đánh giá địa điểm này rồi' });
    }

    const review = await Review.create({ venueId: req.params.id, userId: req.user._id, rating, comment });
    await recalculateVenueRating(req.params.id);
    res.status(201).json({ review });
});

// ============================================================
// API CHO CHỦ SÂN
// ============================================================

exports.getOwnerVenues = asyncHandler(async (req, res) => {
    // Trước đây chỉ trả về venue thô, chủ sân không thấy được venue nào
    // còn thiếu sân con/giá — nên gộp luôn thống kê sân cho từng venue ở đây.
    const venues = await Venue.aggregate([
        { $match: { ownerId: req.user._id } },
        {
            $lookup: {
                from: 'courts',
                let: { venueId: '$_id' },
                pipeline: [{ $match: { $expr: { $eq: ['$venueId', '$$venueId'] } } }],
                as: 'courts',
            },
        },
        {
            $addFields: {
                courtCount: { $size: '$courts' },
                activeCourtCount: { $size: { $filter: { input: '$courts', cond: { $eq: ['$$this.status', 'active'] } } } },
                minPricePerHour: { $min: '$courts.pricePerHour' },
            },
        },
        { $project: { courts: 0 } },
        { $sort: { createdAt: -1 } },
    ]);
    res.json({ venues });
});

exports.createVenue = asyncHandler(async (req, res) => {
    const images = req.files ? req.files.map((f) => fileUrl(f)) : [];
    // TRƯỚC ĐÂY: Venue.create({ ...req.body, ... }) — chủ sân gửi thêm
    // { rating: 5, reviewCount: 999, status: 'approved' } là ghi đè được hết,
    // tự tạo điểm đánh giá giả ngay từ lúc tạo địa điểm. Dùng đúng danh sách
    // trường cho phép, giống hệt cách updateVenue đang làm — KHÔNG spread
    // thẳng req.body.
    const EDITABLE = ['name', 'description', 'sports', 'amenities', 'rules', 'openHours', 'address', 'transferRequiresApproval'];
    const payload = {};
    EDITABLE.forEach((field) => {
        if (req.body[field] === undefined) return;
        if (field === 'sports' || field === 'amenities') {
            payload[field] = Array.isArray(req.body[field]) ? req.body[field] : [req.body[field]].filter(Boolean);
        } else {
            payload[field] = req.body[field];
        }
    });

    // Chủ sân đã được admin xét duyệt ở bước đăng ký làm chủ sân (owner application),
    // nên địa điểm họ tạo ra được duyệt tự động, không cần thêm 1 vòng duyệt riêng nữa.
    const venue = await Venue.create({ ...payload, images, ownerId: req.user._id, status: 'approved' });
    res.status(201).json({ venue });
});

exports.updateVenue = asyncHandler(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    if (venue.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa địa điểm này' });
    }
    const newImages = req.files && req.files.length ? req.files.map((f) => fileUrl(f)) : undefined;

    // TRƯỚC ĐÂY: Object.assign(venue, req.body) — chủ sân gửi thêm
    // { status: 'approved', rating: 5, ownerId: '...' } là ghi đè được hết.
    // Giờ chỉ nhận đúng các trường được phép sửa.
    const EDITABLE = ['name', 'description', 'sports', 'amenities', 'rules', 'openHours', 'address', 'transferRequiresApproval'];
    EDITABLE.forEach((field) => {
        if (req.body[field] === undefined) return;
        if (field === 'sports' || field === 'amenities') {
            venue[field] = Array.isArray(req.body[field]) ? req.body[field] : [req.body[field]].filter(Boolean);
        } else {
            venue[field] = req.body[field];
        }
    });
    const oldImages = venue.images || [];
    if (newImages) venue.images = newImages;
    await venue.save();
    // Ảnh cũ đã bị thay thế: dọn khỏi Cloudinary (chỉ ảnh do hệ thống tự lưu) cho đỡ tốn dung lượng.
    if (newImages) oldImages.forEach(removeStoredFile);
    res.json({ venue });
});

exports.deleteVenue = asyncHandler(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    if (venue.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa địa điểm này' });
    }
    await venue.deleteOne();
    await Court.deleteMany({ venueId: venue._id });
    (venue.images || []).forEach(removeStoredFile);
    res.json({ message: 'Đã xóa địa điểm' });
});

exports.toggleVenueStatus = asyncHandler(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    if (venue.ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa địa điểm này' });
    }
    venue.isActive = !venue.isActive;
    await venue.save();
    res.json({ venue });
});

// ===== QUẢN LÝ ĐỊA ĐIỂM PHÍA ADMIN =====
// Trước đây admin không có cách nào xem/xử lý một địa điểm cụ thể trên toàn nền
// tảng (chỉ có trang duyệt hồ sơ chủ sân, không liên quan đến từng venue). Các
// hàm dưới đây cho phép admin xem toàn bộ venue kèm thông tin chủ sân, và có
// quyền xóa/tạm ngưng bất kỳ venue nào — kể cả không phải chủ sở hữu — để xử lý
// trường hợp địa điểm giả mạo/vi phạm.
// Tách riêng số liệu thống kê khỏi danh sách venue — vì danh sách giờ đã phân
// trang phía server, không thể tính "tổng/đang hoạt động/..." từ 1 trang dữ
// liệu (chỉ 10 dòng) như trước được nữa.
exports.getVenueStatsAdmin = asyncHandler(async (req, res) => {
    const total = await Venue.countDocuments();
    const active = await Venue.countDocuments({ isActive: true });
    const suspended = await Venue.countDocuments({ isActive: false });
    const venueIdsWithCourts = await Court.distinct('venueId');
    const noCourt = total - (await Venue.countDocuments({ _id: { $in: venueIdsWithCourts } }));
    res.json({ total, active, suspended, noCourt });
});

exports.getAllVenuesAdmin = asyncHandler(async (req, res) => {
    const { search = '', page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);

    const pipeline = [
        {
            $lookup: {
                from: 'courts',
                let: { venueId: '$_id' },
                pipeline: [{ $match: { $expr: { $eq: ['$venueId', '$$venueId'] } } }],
                as: 'courts',
            },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'ownerId',
                foreignField: '_id',
                as: 'owner',
            },
        },
        { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                courtCount: { $size: '$courts' },
                ownerName: '$owner.name',
                ownerEmail: '$owner.email',
                ownerPhone: '$owner.phone',
            },
        },
        { $project: { courts: 0, owner: 0 } },
    ];

    if (search.trim()) {
        const re = new RegExp(escapeRegex(search.trim()), 'i');
        pipeline.push({ $match: { $or: [{ name: re }, { ownerName: re }, { ownerEmail: re }] } });
    }

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({
        $facet: {
            data: [{ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }],
            totalCount: [{ $count: 'count' }],
        },
    });

    const [result] = await Venue.aggregate(pipeline);
    const total = result.totalCount[0]?.count || 0;
    res.json({
        venues: result.data,
        total,
        page: pageNum,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
    });
});

exports.adminDeleteVenue = asyncHandler(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    const { reason } = req.body;
    // Lưu lại ownerId/tên venue TRƯỚC khi xóa để còn gửi thông báo được sau đó.
    const ownerId = venue.ownerId;
    const venueName = venue.name;
    await venue.deleteOne();
    await Court.deleteMany({ venueId: venue._id });
    if (ownerId) {
        await Notification.create({
            userId: ownerId,
            type: 'venue_moderation',
            icon: '🗑️',
            title: `Địa điểm "${venueName}" đã bị xóa`,
            message: reason?.trim()
                ? `Quản trị viên đã xóa địa điểm "${venueName}" của bạn. Lý do: ${reason.trim()}`
                : `Quản trị viên đã xóa địa điểm "${venueName}" của bạn khỏi nền tảng.`,
            link: '/owner/venues',
        });
    }
    res.json({ message: 'Đã xóa địa điểm' });
});

exports.adminToggleVenueStatus = asyncHandler(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    const { reason } = req.body;
    const wasActive = venue.isActive;
    venue.isActive = !venue.isActive;
    await venue.save();

    if (venue.ownerId) {
        if (wasActive) {
            // Đang chuyển từ hoạt động -> tạm ngưng: đây là tin xấu, luôn cần lý do rõ ràng.
            await Notification.create({
                userId: venue.ownerId,
                type: 'venue_moderation',
                icon: '⏸️',
                title: `Địa điểm "${venue.name}" đã bị tạm ngưng`,
                message: reason?.trim()
                    ? `Quản trị viên đã tạm ngưng hiển thị địa điểm "${venue.name}". Lý do: ${reason.trim()}. Vui lòng khắc phục và liên hệ quản trị viên để được kích hoạt lại.`
                    : `Quản trị viên đã tạm ngưng hiển thị địa điểm "${venue.name}" của bạn với khách hàng.`,
                link: '/owner/venues',
            });
        } else {
            // Kích hoạt lại: tin tốt, không bắt buộc phải có lý do.
            await Notification.create({
                userId: venue.ownerId,
                type: 'venue_moderation',
                icon: '✅',
                title: `Địa điểm "${venue.name}" đã được kích hoạt lại`,
                message: `Địa điểm "${venue.name}" của bạn đã hiển thị lại với khách hàng như bình thường.`,
                link: '/owner/venues',
            });
        }
    }
    res.json({ venue });
});

// "Gửi cảnh báo" — bước ĐẦU TIÊN trong quy trình xử lý địa điểm có vấn đề:
// chỉ gửi thông báo cho chủ sân, KHÔNG đổi trạng thái venue. Nếu chủ sân
// không khắc phục, admin mới chuyển sang Tạm ngưng rồi Xóa (2 hàm phía trên).
exports.warnVenueOwner = asyncHandler(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm này' });
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ message: 'Vui lòng nhập lý do cảnh báo' });
    if (venue.ownerId) {
        await Notification.create({
            userId: venue.ownerId,
            type: 'venue_moderation',
            icon: '⚠️',
            title: `Cảnh báo về địa điểm "${venue.name}"`,
            message: `Quản trị viên nhận được phản ánh về địa điểm "${venue.name}": ${reason.trim()}. Vui lòng kiểm tra và khắc phục sớm để tránh bị tạm ngưng hoặc gỡ bỏ.`,
            link: '/owner/venues',
        });
    }
    res.json({ message: 'Đã gửi cảnh báo đến chủ sân' });
});

// ===== KIỂM DUYỆT ĐÁNH GIÁ (REVIEW) PHÍA ADMIN =====
// Trước đây không có cách nào để admin xóa 1 review xúc phạm/spam — customer
// có thể để lại bất kỳ nội dung gì mà không ai kiểm soát được.
exports.getAllReviewsAdmin = asyncHandler(async (req, res) => {
    const { search = '', page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);

    const pipeline = [
        {
            $lookup: { from: 'venues', localField: 'venueId', foreignField: '_id', as: 'venue' },
        },
        {
            $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'reviewer' },
        },
        { $unwind: { path: '$venue', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$reviewer', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                venueName: { $ifNull: ['$venue.name', 'Đã bị xóa'] },
                reviewerName: { $ifNull: ['$reviewer.name', 'Đã bị xóa'] },
                reviewerEmail: { $ifNull: ['$reviewer.email', ''] },
            },
        },
        { $project: { venue: 0, reviewer: 0 } },
    ];

    if (search.trim()) {
        const re = new RegExp(escapeRegex(search.trim()), 'i');
        pipeline.push({ $match: { $or: [{ venueName: re }, { reviewerName: re }, { reviewerEmail: re }] } });
    }

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({
        $facet: {
            data: [{ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }],
            totalCount: [{ $count: 'count' }],
        },
    });

    const [result] = await Review.aggregate(pipeline);
    const total = result.totalCount[0]?.count || 0;
    res.json({
        reviews: result.data,
        total,
        page: pageNum,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
    });
});

exports.adminDeleteReview = asyncHandler(async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá này' });
    const { reason } = req.body;
    const { userId, venueId } = review;

    await review.deleteOne();
    await recalculateVenueRating(venueId);

    if (userId) {
        await Notification.create({
            userId,
            type: 'review_moderation',
            icon: '🗑️',
            title: 'Đánh giá của bạn đã bị gỡ bỏ',
            message: reason?.trim()
                ? `Quản trị viên đã gỡ bỏ đánh giá của bạn vì: ${reason.trim()}. Vui lòng tuân thủ điều khoản sử dụng khi để lại đánh giá.`
                : 'Quản trị viên đã gỡ bỏ đánh giá của bạn do vi phạm điều khoản sử dụng.',
        });
    }
    res.json({ message: 'Đã xóa đánh giá' });
});
