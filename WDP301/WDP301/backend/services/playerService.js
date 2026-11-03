const PlayerPost = require('../models/PlayerPost');
const JoinRequest = require('../models/JoinRequest');
const Notification = require('../models/Notification');

/** Gửi thông báo; lỗi thông báo không được làm hỏng nghiệp vụ chính. */
async function notify(userId, payload) {
    try { await Notification.create({ userId, type: 'player_match', icon: '🤝', link: '/players/mine', ...payload }); }
    catch (err) { console.error('Gửi thông báo tìm người chơi thất bại:', err.message); }
}

/**
 * Đóng một bài đang hiệu lực và báo cho những người đã xin / đã được nhận.
 * Cập nhật CÓ ĐIỀU KIỆN để hai nơi cùng đóng một lúc không báo hai lần.
 * Trả về bài đã đóng, hoặc null nếu bài không còn hiệu lực.
 */
async function closePost(filter, reason, { notifyHost = false } = {}) {
    const post = await PlayerPost.findOneAndUpdate(
        { ...filter, active: true },
        { status: 'closed', active: false, closedReason: reason },
        { new: true }
    );
    if (!post) return null;

    const requests = await JoinRequest.find({ postId: post._id, status: { $in: ['pending', 'accepted'] } });
    const label = `${post.venueName || 'sân'} ngày ${post.date} lúc ${post.startTime}`;
    await Promise.all(requests.map((r) => notify(r.userId, {
        title: 'Nhóm chơi đã đóng',
        message: `Bài tìm người chơi tại ${label} đã đóng: ${reason}.`,
    })));
    if (notifyHost) {
        await notify(post.hostId, { title: 'Bài tìm người chơi đã đóng', message: `Bài tìm người tại ${label} đã tự đóng: ${reason}.` });
    }
    return post;
}

/**
 * Gọi khi một lượt đặt KHÔNG CÒN hiệu lực (bị hủy, chủ sân hủy/không đến, đã chuyển đi) để đóng bài tìm người
 * gắn với nó. Luôn nuốt lỗi: đây là bước phụ, không được làm hỏng việc hủy/chuyển lượt đặt.
 */
async function closeForBooking(bookingId, reason) {
    try { await closePost({ bookingId }, reason, { notifyHost: true }); }
    catch (err) { console.error('closeForBooking:', err.message); }
}

module.exports = { closePost, closeForBooking, notify };
