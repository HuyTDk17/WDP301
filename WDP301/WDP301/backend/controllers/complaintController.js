const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const User = require('../models/User');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');
const { fileUrl } = require('../utils/uploads');

const { CATEGORIES, STATUSES } = Complaint;
const isId = (v) => mongoose.isValidObjectId(v);
const OPEN_STATES = ['open', 'investigating'];

/** Chuẩn hóa độ dài nội dung. Trả về thông báo lỗi hoặc null nếu hợp lệ. */
function validateContent({ subject, description }) {
    if (!subject || subject.trim().length < 5) return 'Tiêu đề khiếu nại cần ít nhất 5 ký tự';
    if (subject.trim().length > 120) return 'Tiêu đề khiếu nại tối đa 120 ký tự';
    if (!description || description.trim().length < 20) return 'Vui lòng mô tả chi tiết hơn (ít nhất 20 ký tự) để quản trị viên xử lý được';
    if (description.trim().length > 3000) return 'Nội dung khiếu nại tối đa 3000 ký tự';
    return null;
}

/** Gửi một thông báo; lỗi thông báo không được làm hỏng nghiệp vụ chính. */
async function notify(userId, payload) {
    try { await Notification.create({ userId, ...payload }); }
    catch (err) { console.error('Gửi thông báo khiếu nại thất bại:', err.message); }
}

async function notifyAdmins(payload) {
    const admins = await User.find({ role: 'admin', status: { $ne: 'banned' } }).select('_id');
    await Promise.all(admins.map((a) => notify(a._id, payload)));
}

// ============================================================
// KHÁCH HÀNG
// ============================================================

// @route   POST /api/complaints   (multipart: evidence[])
// Khách chọn một lượt đặt của chính mình (bookingId) HOẶC một địa điểm (venueId).
exports.createComplaint = asyncHandler(async (req, res) => {
    const { bookingId, venueId, category = 'other', subject = '', description = '' } = req.body;

    if (!CATEGORIES.includes(category)) return res.status(400).json({ message: 'Loại khiếu nại không hợp lệ' });
    const contentError = validateContent({ subject, description });
    if (contentError) return res.status(400).json({ message: contentError });

    let venue;
    let booking = null;
    if (bookingId) {
        if (!isId(bookingId)) return res.status(400).json({ message: 'Mã lượt đặt không hợp lệ' });
        // Chỉ khiếu nại được lượt đặt CỦA CHÍNH MÌNH — không thể khiếu nại thay người khác.
        booking = await Booking.findOne({ _id: bookingId, customerId: req.user._id });
        if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt này trong tài khoản của bạn' });
        venue = await Venue.findById(booking.venueId);
    } else if (venueId) {
        if (!isId(venueId)) return res.status(400).json({ message: 'Mã địa điểm không hợp lệ' });
        venue = await Venue.findById(venueId);
    } else {
        return res.status(400).json({ message: 'Vui lòng chọn lượt đặt hoặc địa điểm bạn muốn khiếu nại' });
    }
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy địa điểm cần khiếu nại' });
    if (String(venue.ownerId) === String(req.user._id)) {
        return res.status(400).json({ message: 'Bạn không thể khiếu nại địa điểm của chính mình' });
    }

    if (booking) {
        const dup = await Complaint.exists({ bookingId: booking._id, status: { $in: OPEN_STATES } });
        if (dup) return res.status(409).json({ message: 'Lượt đặt này đã có khiếu nại đang được xử lý' });
    }
    // Giới hạn số khiếu nại đang mở cùng lúc để tránh spam quản trị viên.
    const openCount = await Complaint.countDocuments({ customerId: req.user._id, status: { $in: OPEN_STATES } });
    if (openCount >= 5) {
        return res.status(429).json({ message: 'Bạn đang có 5 khiếu nại chưa được giải quyết. Vui lòng chờ xử lý xong rồi gửi thêm.' });
    }

    const evidence = req.files ? req.files.map((f) => fileUrl(f)) : [];
    let complaint;
    try {
        complaint = await Complaint.create({
            customerId: req.user._id,
            ownerId: venue.ownerId,
            venueId: venue._id,
            bookingId: booking ? booking._id : null,
            venueName: venue.name,
            category,
            subject: subject.trim(),
            description: description.trim(),
            evidence,
        });
    } catch (err) {
        // Hai request gửi cùng lúc cho một lượt đặt: chỉ mục duy nhất giữ đúng một cái.
        if (err.code === 11000) return res.status(409).json({ message: 'Lượt đặt này đã có khiếu nại đang được xử lý' });
        throw err;
    }

    await notifyAdmins({
        type: 'complaint', icon: '📣',
        title: 'Có khiếu nại mới',
        message: `${req.user.name} gửi khiếu nại về "${venue.name}": ${complaint.subject}`,
        link: '/admin/complaints',
    });

    res.status(201).json({ complaint });
});

// @route   GET /api/complaints/my
exports.getMyComplaints = asyncHandler(async (req, res) => {
    const filter = { customerId: req.user._id };
    if (req.query.status && STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ complaints });
});

// @route   GET /api/complaints/:id
exports.getMyComplaintById = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const complaint = await Complaint.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!complaint) return res.status(404).json({ message: 'Không tìm thấy khiếu nại này' });
    // Khách chỉ thấy các tin admin gửi cho MÌNH, không thấy tin trao đổi riêng với chủ sân.
    const data = complaint.toObject();
    data.messages = (data.messages || []).filter((m) => m.to === 'customer');
    res.json({ complaint: data });
});

// ============================================================
// QUẢN TRỊ VIÊN
// ============================================================

// @route   GET /api/admin/complaints?status=&search=&page=&limit=
exports.getComplaintsAdmin = asyncHandler(async (req, res) => {
    const { status, search = '', page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    const filter = {};
    if (status && STATUSES.includes(status)) filter.status = status;
    if (search.trim()) {
        const re = new RegExp(escapeRegex(search.trim()), 'i');
        // Tìm theo tiêu đề / tên địa điểm; thêm tên/email khách nếu khớp.
        const users = await User.find({ $or: [{ name: re }, { email: re }] }).select('_id').limit(50);
        filter.$or = [{ subject: re }, { venueName: re }, { customerId: { $in: users.map((u) => u._id) } }];
    }

    const [total, complaints, grouped] = await Promise.all([
        Complaint.countDocuments(filter),
        Complaint.find(filter)
            .populate('customerId', 'name email phone avatar')
            .populate('ownerId', 'name email phone')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum),
        Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const stats = { open: 0, investigating: 0, resolved: 0, rejected: 0 };
    grouped.forEach((g) => { stats[g._id] = g.count; });
    stats.total = Object.values(stats).reduce((a, b) => a + b, 0);

    res.json({ complaints, total, page: pageNum, totalPages: Math.max(1, Math.ceil(total / limitNum)), stats });
});

// @route   GET /api/admin/complaints/:id
exports.getComplaintAdmin = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const complaint = await Complaint.findById(req.params.id)
        .populate('customerId', 'name email phone avatar')
        .populate('ownerId', 'name email phone')
        .populate('bookingId', 'venueName courtName date startTime endTime amount status')
        .populate('resolvedBy', 'name');
    if (!complaint) return res.status(404).json({ message: 'Không tìm thấy khiếu nại này' });
    res.json({ complaint });
});

// @route   PATCH /api/admin/complaints/:id/start     — nhận xử lý (open → investigating)
exports.startInvestigation = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    // Cập nhật có điều kiện để hai admin bấm cùng lúc không ghi đè nhau.
    const complaint = await Complaint.findOneAndUpdate(
        { _id: req.params.id, status: 'open' },
        { status: 'investigating' },
        { new: true }
    );
    if (!complaint) {
        const exists = await Complaint.exists({ _id: req.params.id });
        return res.status(exists ? 409 : 404).json({ message: exists ? 'Khiếu nại này không còn ở trạng thái chờ xử lý' : 'Không tìm thấy khiếu nại này' });
    }
    await notify(complaint.customerId, {
        type: 'complaint', icon: '🔎',
        title: 'Khiếu nại của bạn đang được xử lý',
        message: `Quản trị viên đã tiếp nhận khiếu nại "${complaint.subject}" và đang xem xét.`,
        link: '/complaints',
    });
    res.json({ complaint });
});

// @route   POST /api/admin/complaints/:id/contact   body: { target: 'customer'|'owner', message }
exports.contactParty = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const { target, message = '' } = req.body;
    if (!['customer', 'owner'].includes(target)) return res.status(400).json({ message: 'Người nhận không hợp lệ' });
    const text = String(message).trim();
    if (text.length < 5) return res.status(400).json({ message: 'Vui lòng nhập nội dung cần gửi (ít nhất 5 ký tự)' });
    if (text.length > 2000) return res.status(400).json({ message: 'Nội dung tối đa 2000 ký tự' });

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Không tìm thấy khiếu nại này' });
    if (!OPEN_STATES.includes(complaint.status)) {
        return res.status(409).json({ message: 'Khiếu nại đã được giải quyết, không thể gửi thêm tin nhắn' });
    }

    if (complaint.status === 'open') complaint.status = 'investigating';
    complaint.messages.push({ to: target, text });
    await complaint.save();

    if (target === 'customer') {
        await notify(complaint.customerId, {
            type: 'complaint', icon: '💬',
            title: 'Quản trị viên phản hồi khiếu nại của bạn',
            message: text, link: '/complaints',
        });
    } else {
        // Không tiết lộ danh tính khách cho chủ sân; chỉ nêu địa điểm và nội dung admin cần chủ sân trả lời.
        await notify(complaint.ownerId, {
            type: 'complaint', icon: '📩',
            title: `Quản trị viên cần bạn làm rõ về "${complaint.venueName}"`,
            message: text, link: '/owner/notifications',
        });
    }
    res.json({ complaint });
});

// @route   POST /api/admin/complaints/:id/resolve   body: { decision: 'resolved'|'rejected', resolution }
exports.resolveComplaint = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const { decision, resolution = '' } = req.body;
    if (!['resolved', 'rejected'].includes(decision)) return res.status(400).json({ message: 'Quyết định không hợp lệ' });
    const text = String(resolution).trim();
    if (text.length < 10) return res.status(400).json({ message: 'Vui lòng nhập phản hồi gửi khách hàng (ít nhất 10 ký tự)' });
    if (text.length > 3000) return res.status(400).json({ message: 'Phản hồi tối đa 3000 ký tự' });

    const complaint = await Complaint.findOneAndUpdate(
        { _id: req.params.id, status: { $in: OPEN_STATES } },
        { status: decision, active: false, resolution: text, resolvedBy: req.user._id, resolvedAt: new Date() },
        { new: true }
    );
    if (!complaint) {
        const exists = await Complaint.exists({ _id: req.params.id });
        return res.status(exists ? 409 : 404).json({ message: exists ? 'Khiếu nại này đã được xử lý trước đó' : 'Không tìm thấy khiếu nại này' });
    }

    const accepted = decision === 'resolved';
    await notify(complaint.customerId, {
        type: 'complaint', icon: accepted ? '✅' : 'ℹ️',
        title: accepted ? 'Khiếu nại của bạn đã được giải quyết' : 'Khiếu nại của bạn đã được xem xét',
        message: text, link: '/complaints',
    });
    if (accepted) {
        await notify(complaint.ownerId, {
            type: 'complaint', icon: '📋',
            title: `Khiếu nại liên quan "${complaint.venueName}" đã được xử lý`,
            message: 'Quản trị viên đã giải quyết một khiếu nại về địa điểm của bạn. Vui lòng nâng cao chất lượng dịch vụ để tránh phát sinh thêm.',
            link: '/owner/notifications',
        });
    }
    res.json({ complaint });
});
