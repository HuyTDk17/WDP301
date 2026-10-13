const mongoose = require('mongoose');
const PlayerPost = require('../models/PlayerPost');
const JoinRequest = require('../models/JoinRequest');
const Booking = require('../models/Booking');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { contactOf } = require('../utils/zalo');
const { closePost, notify } = require('../services/playerService');

const isId = (v) => mongoose.isValidObjectId(v);
const LEVELS = ['any', 'beginner', 'intermediate', 'advanced'];
const MAX_ACTIVE_POSTS = 5;      // bài còn hiệu lực / người đăng
const MAX_PENDING_REQUESTS = 10; // yêu cầu đang chờ / người xin
const needPhone = { message: 'Vui lòng cập nhật số điện thoại trong hồ sơ để dùng chức năng này — hai bên cần số điện thoại để liên lạc sau khi được ghép nhóm.' };

// Giờ bắt đầu của lượt đặt (giờ Việt Nam, UTC+7) → Date
const startsAtOf = (date, time) => new Date(`${date}T${time}:00+07:00`);
const publicUser = (u) => (u ? { _id: u._id, name: u.name, avatar: u.avatar || null } : null);

/** Lượt đặt gắn với bài còn "đã xác nhận" không? (khoá chặt: bài chỉ có nghĩa khi lượt đặt còn hiệu lực) */
async function bookingStillConfirmed(bookingId) {
    return !!(await Booking.exists({ _id: bookingId, status: 'confirmed' }));
}

// ============================================================
// BÀI TÌM NGƯỜI
// ============================================================

// @route POST /api/players   body: { bookingId, slotsNeeded, level, note }
exports.createPost = asyncHandler(async (req, res) => {
    if (!req.user.phone) return res.status(400).json(needPhone);
    const { bookingId, level = 'any' } = req.body;
    const note = String(req.body.note || '').trim();
    const slotsNeeded = Number(req.body.slotsNeeded);

    if (!isId(bookingId)) return res.status(400).json({ message: 'Vui lòng chọn lượt đặt sân' });
    if (!Number.isInteger(slotsNeeded) || slotsNeeded < 1 || slotsNeeded > 20) return res.status(400).json({ message: 'Số người cần thêm phải từ 1 đến 20' });
    if (!LEVELS.includes(level)) return res.status(400).json({ message: 'Trình độ không hợp lệ' });
    if (note.length > 300) return res.status(400).json({ message: 'Ghi chú tối đa 300 ký tự' });

    // Chỉ đăng cho lượt đặt CỦA CHÍNH MÌNH.
    const booking = await Booking.findOne({ _id: bookingId, customerId: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt này trong tài khoản của bạn' });
    if (booking.status !== 'confirmed') return res.status(409).json({ message: 'Chỉ lượt đặt đã xác nhận mới đăng tìm người được' });
    const startsAt = startsAtOf(booking.date, booking.startTime);
    if (startsAt <= new Date()) return res.status(409).json({ message: 'Lượt đặt này đã bắt đầu hoặc đã qua' });

    if (await PlayerPost.exists({ bookingId: booking._id, active: true })) return res.status(409).json({ message: 'Lượt đặt này đã có bài tìm người đang mở' });
    if ((await PlayerPost.countDocuments({ hostId: req.user._id, active: true, startsAt: { $gt: new Date() } })) >= MAX_ACTIVE_POSTS) {
        return res.status(429).json({ message: `Bạn đang có ${MAX_ACTIVE_POSTS} bài tìm người chưa diễn ra. Hãy đóng bớt hoặc chờ diễn ra trước khi đăng thêm.` });
    }

    let post;
    try {
        post = await PlayerPost.create({
            hostId: req.user._id, bookingId: booking._id, venueId: booking.venueId,
            venueName: booking.venueName, courtName: booking.courtName, sport: booking.sport,
            date: booking.date, startTime: booking.startTime, endTime: booking.endTime, startsAt,
            slotsNeeded, level, note,
        });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ message: 'Lượt đặt này đã có bài tìm người đang mở' });
        throw err;
    }
    res.status(201).json({ post });
});

// @route GET /api/players?sport=&venueId=&date=&level=&page=&limit=
// Danh sách bài còn chỗ, chưa bắt đầu. Công khai tên + ảnh của chủ nhóm — KHÔNG có số điện thoại/email.
exports.listPosts = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const { sport, venueId, date, level } = req.query;
    if (venueId && !isId(venueId)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'Ngày không hợp lệ' });

    const filter = { status: 'open', active: true, startsAt: { $gt: new Date() } };
    if (sport) filter.sport = String(sport);
    if (venueId) filter.venueId = venueId;
    if (date) filter.date = date;
    if (LEVELS.includes(level) && level !== 'any') filter.level = { $in: [level, 'any'] };

    const [total, posts] = await Promise.all([
        PlayerPost.countDocuments(filter),
        PlayerPost.find(filter).sort({ startsAt: 1 }).skip((page - 1) * limit).limit(limit),
    ]);
    // Lượt đặt bị hủy/chuyển mà bài chưa kịp đóng (hook lỗi) thì vẫn không hiện ra.
    const live = new Set((await Booking.find({ _id: { $in: posts.map((p) => p.bookingId) }, status: 'confirmed' }).select('_id')).map((b) => String(b._id)));
    const visible = posts.filter((p) => live.has(String(p.bookingId)));

    const [hosts, mine] = await Promise.all([
        User.find({ _id: { $in: visible.map((p) => p.hostId) } }).select('name avatar'),
        JoinRequest.find({ postId: { $in: visible.map((p) => p._id) }, userId: req.user._id }),
    ]);
    const hostMap = new Map(hosts.map((h) => [String(h._id), h]));
    const mineMap = new Map(mine.map((r) => [String(r.postId), r]));

    res.json({
        posts: visible.map((p) => ({
            _id: p._id, venueId: p.venueId, venueName: p.venueName, courtName: p.courtName, sport: p.sport,
            date: p.date, startTime: p.startTime, endTime: p.endTime, startsAt: p.startsAt,
            slotsNeeded: p.slotsNeeded, acceptedCount: p.acceptedCount, level: p.level, note: p.note,
            host: publicUser(hostMap.get(String(p.hostId))),
            isMine: String(p.hostId) === String(req.user._id),
            myRequest: mineMap.get(String(p._id))?.status || null,
        })),
        total, page, totalPages: Math.max(1, Math.ceil(total / limit)),
    });
});

// @route GET /api/players/mine — bài của tôi kèm các yêu cầu; SĐT chỉ hiện với yêu cầu ĐÃ CHẤP NHẬN
exports.getMyPosts = asyncHandler(async (req, res) => {
    const posts = await PlayerPost.find({ hostId: req.user._id }).sort({ startsAt: -1 }).limit(50);
    const requests = await JoinRequest.find({ postId: { $in: posts.map((p) => p._id) }, status: { $in: ['pending', 'accepted', 'rejected'] } });
    const users = await User.find({ _id: { $in: requests.map((r) => r.userId) } }).select('name avatar phone');
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    res.json({
        posts: posts.map((p) => ({
            ...p.toObject(),
            requests: requests.filter((r) => String(r.postId) === String(p._id)).map((r) => {
                const u = userMap.get(String(r.userId));
                return {
                    _id: r._id, status: r.status, message: r.message, createdAt: r.createdAt,
                    user: publicUser(u),
                    ...(r.status === 'accepted' && p.status !== 'closed' ? { contact: contactOf(u) } : {}),
                };
            }),
        })),
    });
});

// @route POST /api/players/:id/close — chủ nhóm đóng bài
exports.closeMyPost = asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const mine = await PlayerPost.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!mine) return res.status(404).json({ message: 'Không tìm thấy bài này' });
    const post = await closePost({ _id: mine._id }, 'chủ nhóm đã đóng bài');
    if (!post) return res.status(409).json({ message: 'Bài này đã đóng trước đó' });
    res.json({ post });
});

// ============================================================
// YÊU CẦU THAM GIA
// ============================================================

// @route POST /api/players/:id/join   body: { message }
exports.joinPost = asyncHandler(async (req, res) => {
    if (!req.user.phone) return res.status(400).json(needPhone);
    if (!isId(req.params.id)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const message = String(req.body.message || '').trim();
    if (message.length > 200) return res.status(400).json({ message: 'Lời nhắn tối đa 200 ký tự' });

    const post = await PlayerPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Không tìm thấy bài này' });
    if (String(post.hostId) === String(req.user._id)) return res.status(400).json({ message: 'Bạn không thể xin vào nhóm của chính mình' });
    if (post.status === 'full') return res.status(409).json({ message: 'Nhóm này đã đủ người' });
    if (post.status !== 'open' || post.startsAt <= new Date()) return res.status(409).json({ message: 'Bài này đã đóng hoặc đã bắt đầu' });
    if (!(await bookingStillConfirmed(post.bookingId))) return res.status(409).json({ message: 'Lượt đặt của nhóm này không còn hiệu lực' });

    if ((await JoinRequest.countDocuments({ userId: req.user._id, status: 'pending' })) >= MAX_PENDING_REQUESTS) {
        return res.status(429).json({ message: `Bạn đang có ${MAX_PENDING_REQUESTS} yêu cầu chờ phản hồi. Hãy chờ hoặc rút bớt trước khi xin thêm.` });
    }

    let request;
    try {
        request = await JoinRequest.create({ postId: post._id, hostId: post.hostId, userId: req.user._id, message });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ message: 'Bạn đã gửi yêu cầu cho bài này rồi' });
        throw err;
    }
    await notify(post.hostId, {
        title: 'Có người muốn tham gia nhóm của bạn',
        message: `${req.user.name} xin tham gia buổi chơi tại ${post.venueName} ngày ${post.date} lúc ${post.startTime}.`,
    });
    res.status(201).json({ request });
});

// @route POST /api/players/requests/:requestId/respond   body: { decision: 'accept'|'reject' }  (chủ nhóm)
exports.respondToRequest = asyncHandler(async (req, res) => {
    if (!isId(req.params.requestId)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const { decision } = req.body;
    if (!['accept', 'reject'].includes(decision)) return res.status(400).json({ message: 'Quyết định không hợp lệ' });

    const request = await JoinRequest.findById(req.params.requestId);
    // Cùng một thông báo cho "không tồn tại" và "không phải của bạn".
    if (!request || String(request.hostId) !== String(req.user._id)) return res.status(404).json({ message: 'Không tìm thấy yêu cầu này' });
    if (request.status !== 'pending') return res.status(409).json({ message: 'Yêu cầu này đã được xử lý' });
    const post = await PlayerPost.findById(request.postId);
    if (!post) return res.status(404).json({ message: 'Không tìm thấy bài này' });
    const label = `${post.venueName} ngày ${post.date} lúc ${post.startTime}`;

    if (decision === 'reject') {
        const updated = await JoinRequest.findOneAndUpdate({ _id: request._id, status: 'pending' }, { status: 'rejected', respondedAt: new Date() }, { new: true });
        if (!updated) return res.status(409).json({ message: 'Yêu cầu này đã được xử lý' });
        await notify(request.userId, { title: 'Yêu cầu tham gia chưa được nhận', message: `Chủ nhóm chưa nhận yêu cầu của bạn cho buổi chơi tại ${label}.` });
        return res.json({ request: updated });
    }

    if (post.startsAt <= new Date()) return res.status(409).json({ message: 'Buổi chơi đã bắt đầu' });
    if (!(await bookingStillConfirmed(post.bookingId))) return res.status(409).json({ message: 'Lượt đặt của nhóm không còn hiệu lực' });

    // Giữ chỗ NGUYÊN TỬ: chỉ tăng khi bài còn mở và chưa đủ người — hai lần chấp nhận cùng lúc không vượt quá số chỗ.
    const claimed = await PlayerPost.findOneAndUpdate(
        { _id: post._id, status: 'open', acceptedCount: { $lt: post.slotsNeeded } },
        { $inc: { acceptedCount: 1 } },
        { new: true }
    );
    if (!claimed) return res.status(409).json({ message: 'Nhóm đã đủ người hoặc đã đóng' });

    const accepted = await JoinRequest.findOneAndUpdate({ _id: request._id, status: 'pending' }, { status: 'accepted', respondedAt: new Date() }, { new: true });
    if (!accepted) {
        // Người xin vừa rút đúng lúc đó: trả lại chỗ vừa giữ.
        await PlayerPost.updateOne({ _id: post._id }, { $inc: { acceptedCount: -1 } });
        return res.status(409).json({ message: 'Yêu cầu này không còn ở trạng thái chờ' });
    }
    if (claimed.acceptedCount >= claimed.slotsNeeded) await PlayerPost.updateOne({ _id: post._id, status: 'open' }, { status: 'full' });

    const requester = await User.findById(request.userId).select('name phone');
    await notify(request.userId, {
        title: 'Bạn đã được nhận vào nhóm 🎉',
        message: `Chủ nhóm đã nhận bạn cho buổi chơi tại ${label}. Mở "Yêu cầu của tôi" để xem số điện thoại và nhắn Zalo cho chủ nhóm.`,
        link: '/players/mine?tab=requests',
    });
    res.json({ request: accepted, contact: contactOf(requester) });
});

// @route POST /api/players/requests/:requestId/withdraw  (người xin tự rút, kể cả sau khi đã được nhận)
exports.withdrawRequest = asyncHandler(async (req, res) => {
    if (!isId(req.params.requestId)) return res.status(400).json({ message: 'Định dạng ID không hợp lệ' });
    const request = await JoinRequest.findOne({ _id: req.params.requestId, userId: req.user._id });
    if (!request) return res.status(404).json({ message: 'Không tìm thấy yêu cầu này' });
    const wasAccepted = request.status === 'accepted';
    const updated = await JoinRequest.findOneAndUpdate(
        { _id: request._id, status: { $in: ['pending', 'accepted'] } },
        { status: 'withdrawn', active: false, respondedAt: new Date() },
        { new: true }
    );
    if (!updated) return res.status(409).json({ message: 'Yêu cầu này không thể rút' });

    if (wasAccepted) {
        const post = await PlayerPost.findOneAndUpdate({ _id: request.postId, acceptedCount: { $gt: 0 } }, { $inc: { acceptedCount: -1 } }, { new: true });
        // Có chỗ trống lại thì mở lại bài (nếu bài chưa bị đóng).
        if (post && post.status === 'full') await PlayerPost.updateOne({ _id: post._id, status: 'full' }, { status: 'open' });
        if (post) {
            await notify(request.hostId, {
                title: 'Một người chơi đã rút khỏi nhóm',
                message: `${req.user.name} đã rút khỏi buổi chơi tại ${post.venueName} ngày ${post.date} lúc ${post.startTime}. Nhóm lại còn chỗ trống.`,
            });
        }
    }
    res.json({ request: updated });
});

// @route GET /api/players/requests/mine — yêu cầu của tôi; liên lạc chủ nhóm chỉ hiện khi ĐÃ ĐƯỢC NHẬN và nhóm còn hiệu lực
exports.getMyRequests = asyncHandler(async (req, res) => {
    const requests = await JoinRequest.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    const posts = await PlayerPost.find({ _id: { $in: requests.map((r) => r.postId) } });
    const postMap = new Map(posts.map((p) => [String(p._id), p]));
    const hosts = await User.find({ _id: { $in: posts.map((p) => p.hostId) } }).select('name avatar phone');
    const hostMap = new Map(hosts.map((h) => [String(h._id), h]));

    res.json({
        requests: requests.filter((r) => r.status !== 'withdrawn').map((r) => {
            const p = postMap.get(String(r.postId));
            const host = p ? hostMap.get(String(p.hostId)) : null;
            return {
                _id: r._id, status: r.status, message: r.message, createdAt: r.createdAt,
                post: p ? {
                    _id: p._id, venueName: p.venueName, courtName: p.courtName, sport: p.sport, date: p.date,
                    startTime: p.startTime, endTime: p.endTime, startsAt: p.startsAt, status: p.status, host: publicUser(host),
                } : null,
                ...(r.status === 'accepted' && p && p.status !== 'closed' ? { contact: contactOf(host) } : {}),
            };
        }),
    });
});
