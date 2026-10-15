const User = require('../models/User');
const Notification = require('../models/Notification');
const Venue = require('../models/Venue');
const Court = require('../models/Court');
const Booking = require('../models/Booking');
const asyncHandler = require('../utils/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');

exports.getUsers = asyncHandler(async (req, res) => {
    const { role, search = '', page = 1, limit = 10 } = req.query;
    // Trang quản lý người dùng chỉ để quản lý khách hàng/chủ sân — không liệt kê
    // tài khoản admin ở đây, tránh admin tự khóa nhầm tài khoản admin khác.
    const filter = { role: { $ne: 'admin' } };
    if (role && role !== 'admin') filter.role = role;
    if (search.trim()) {
        const re = new RegExp(escapeRegex(search.trim()), 'i');
        filter.$or = [{ name: re }, { email: re }];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
    res.json({
        users: users.map((u) => u.toSafeObject()),
        total,
        page: pageNum,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
    });
});

exports.getUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng này' });
    res.json({ user: user.toSafeObject() });
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng này' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Không thể thay đổi trạng thái của tài khoản quản trị' });

    const previousStatus = user.status;
    const wasOwner = user.role === 'owner';   // đọc TRƯỚC khi các nhánh bên dưới có thể đổi role
    const isUnbanning = previousStatus === 'banned' && status !== 'banned';
    user.status = status;
    if (isUnbanning) user.banReason = '';

    if (status === 'verified') {
        user.role = 'owner';
        user.ownerApplicationStatus = 'approved';
        user.ownerApplicationReviewedAt = new Date();
        user.ownerApplicationRejectionReason = '';
        // Ghi lại AI đã duyệt/mở khóa — trước đây hồ sơ chỉ có "đã duyệt lúc nào",
        // không có "ai duyệt", nên không tra được trách nhiệm khi có tranh chấp.
        user.ownerApplicationReviewedBy = req.user._id;
        // Chỉ gửi thông báo "đã được duyệt" khi đây thực sự là một lượt duyệt mới,
        // không gửi lại khi admin chỉ đang mở khóa một chủ sân đã được duyệt từ trước.
        if (!isUnbanning) {
            await Notification.create({
                userId: user._id,
                type: 'owner_application',
                icon: '✅',
                title: 'Hồ sơ chủ sân đã được duyệt',
                message: 'Bạn đã được cấp quyền chủ sân. Bây giờ bạn có thể đăng địa điểm và quản lý lịch đặt.',
                link: '/owner/dashboard',
            });
        }
    } else if (status === 'rejected') {
        user.role = 'customer';
        user.status = 'active';
        user.ownerApplicationStatus = 'rejected';
        user.ownerApplicationReviewedAt = new Date();
        user.ownerApplicationReviewedBy = req.user._id;
        user.ownerApplicationRejectionReason = reason || 'Hồ sơ chưa đáp ứng yêu cầu xét duyệt.';
        await Notification.create({
            userId: user._id,
            type: 'owner_application',
            icon: '⚠️',
            title: 'Hồ sơ chủ sân bị từ chối',
            message: user.ownerApplicationRejectionReason,
            link: '/owner-application',
        });
    } else if (status === 'banned') {
        user.banReason = reason?.trim() || '';
        // KHÔNG tạo Notification ở đây — tài khoản banned không đăng nhập được
        // nên không bao giờ xem được trang Thông báo (middleware protect chặn
        // mọi request của tài khoản banned, kể cả GET /notifications). Lý do
        // khóa đã được đưa thẳng vào thông báo lỗi lúc đăng nhập (authController.login).
    }

    // TRƯỚC ĐÂY: khóa/từ chối/gỡ quyền chủ sân không hề đụng tới các địa điểm
    // họ đang đứng tên — địa điểm vẫn hiển thị công khai và khách vẫn đặt,
    // chuyển tiền cho một địa điểm mà chủ sân không còn đăng nhập được để xử
    // lý hay nhận thanh toán. Chỉ ẩn tự động những venue ĐANG hoạt động khi
    // xảy ra chuyện này (không đụng venue admin đã tạm ngưng riêng từ trước
    // vì lý do khác — suspendedByOwnerBan phân biệt rõ hai trường hợp).
    const losingOwnerAccess = wasOwner && (status === 'banned' || status === 'rejected');
    if (losingOwnerAccess) {
        const { modifiedCount } = await Venue.updateMany(
            { ownerId: user._id, isActive: true },
            { isActive: false, suspendedByOwnerBan: true }
        );
        if (modifiedCount > 0 && status === 'rejected') {
            await Notification.create({
                userId: user._id,
                type: 'venue_moderation',
                icon: '⏸️',
                title: 'Địa điểm của bạn đã tạm ẩn khỏi khách hàng',
                message: `Do quyền chủ sân của bạn đã bị thu hồi, ${modifiedCount} địa điểm bạn đang đứng tên đã tạm ẩn khỏi khách hàng cho đến khi được xử lý.`,
                link: '/owner/venues',
            });
        }
    } else if (isUnbanning && status === 'verified') {
        // Mở khóa: CHỈ khôi phục đúng những venue mà chính lượt khóa này đã ẩn
        // đi — venue admin tạm ngưng riêng vì lý do khác (suspendedByOwnerBan
        // vẫn là false) không bị đụng tới.
        await Venue.updateMany(
            { ownerId: user._id, suspendedByOwnerBan: true },
            { isActive: true, suspendedByOwnerBan: false }
        );
    }

    // Thông báo "đã mở khóa" là tin tốt, gửi độc lập với nhánh status ở trên —
    // áp dụng dù tài khoản được mở khóa về 'active' (khách hàng) hay 'verified' (chủ sân).
    if (isUnbanning) {
        await Notification.create({
            userId: user._id,
            type: 'account_moderation',
            icon: '✅',
            title: 'Tài khoản của bạn đã được mở khóa',
            message: 'Tài khoản của bạn đã được quản trị viên mở khóa và có thể sử dụng bình thường trở lại.',
        });
    }

    await user.save();
    res.json({ user: user.toSafeObject() });
});

// @route   PATCH /api/admin/owners/:id/confirm-bank-info
// Admin xác nhận ĐÃ KIỂM TRA (gọi điện/đối chiếu) một thay đổi ngân hàng của
// chủ sân sau khi đã được duyệt. Cho tới khi xác nhận, settlementService.issueSettlement
// từ chối lập khoản nền tảng chuyển cho chủ sân này.
exports.confirmBankInfo = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng này' });
    if (!user.bankInfoPendingReview) {
        return res.status(400).json({ message: 'Không có thay đổi ngân hàng nào đang chờ xác nhận' });
    }
    user.bankInfoPendingReview = false;
    user.bankInfoConfirmedAt = new Date();
    user.bankInfoConfirmedBy = req.user._id;
    await user.save();
    res.json({ user: user.toSafeObject() });
});

exports.deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng này' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Không thể xóa tài khoản quản trị' });

    // TRƯỚC ĐÂY: xóa thẳng user dù họ còn đứng tên địa điểm — địa điểm đó trở
    // thành "mồ côi" (ownerId trỏ tới một user không còn tồn tại), khách vẫn
    // đặt/chuyển tiền được cho một địa điểm vĩnh viễn không ai xử lý hay nhận
    // thanh toán. Bắt admin xử lý (xóa/để trống) toàn bộ địa điểm trước.
    if (user.role === 'owner') {
        const venueCount = await Venue.countDocuments({ ownerId: user._id });
        if (venueCount > 0) {
            return res.status(409).json({
                message: `Không thể xóa: chủ sân này còn đứng tên ${venueCount} địa điểm. Hãy xóa các địa điểm đó ở trang Địa điểm trước khi xóa tài khoản.`,
            });
        }
    }
    await user.deleteOne();
    res.json({ message: 'Đã xóa người dùng' });
});

exports.getOwners = asyncHandler(async (req, res) => {
    const owners = await User.find({
        $or: [
            { role: 'owner' },
            { ownerApplicationStatus: { $in: ['pending', 'approved', 'rejected'] } },
        ],
    })
        .sort({ ownerApplicationSubmittedAt: -1, createdAt: -1 })
        // Để hiển thị "đã duyệt bởi ai" trên UI thay vì chỉ một ObjectId trơ.
        .populate('ownerApplicationReviewedBy', 'name email');
    res.json({ owners: owners.map((u) => u.toSafeObject()) });
});

// Trang chi tiết 1 chủ sân cụ thể — không phải hồ sơ đăng ký (đã có ở getOwners),
// mà là dữ liệu HOẠT ĐỘNG THỰC TẾ: đang có bao nhiêu địa điểm/sân, doanh thu,
// đánh giá trung bình... để admin đánh giá 1 chủ sân cụ thể mà không phải tự
// ghép thông tin từ nhiều trang khác nhau.
exports.getOwnerDetail = asyncHandler(async (req, res) => {
    const owner = await User.findById(req.params.id).populate('ownerApplicationReviewedBy', 'name email');
    if (!owner) return res.status(404).json({ message: 'Không tìm thấy chủ sân này' });

    const venues = await Venue.find({ ownerId: owner._id }).sort({ createdAt: -1 });
    const venueIds = venues.map((v) => v._id);
    const courtCounts = await Court.aggregate([
        { $match: { venueId: { $in: venueIds } } },
        { $group: { _id: '$venueId', count: { $sum: 1 } } },
    ]);
    const courtCountMap = Object.fromEntries(courtCounts.map((c) => [c._id.toString(), c.count]));

    const bookings = await Booking.find({ venueId: { $in: venueIds } });
    const paidBookings = bookings.filter((b) => ['confirmed', 'completed'].includes(b.status));
    // Doanh thu chủ sân thực nhận = giá sân trừ phần hoa hồng chủ sân chịu
    const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.amount || 0) - (b.ownerCommission || 0), 0);

    const ratedVenues = venues.filter((v) => v.reviewCount > 0);
    const avgRating = ratedVenues.length
        ? ratedVenues.reduce((sum, v) => sum + v.rating, 0) / ratedVenues.length
        : 0;

    res.json({
        owner: owner.toSafeObject(),
        stats: {
            totalVenues: venues.length,
            activeVenues: venues.filter((v) => v.isActive).length,
            totalCourts: Object.values(courtCountMap).reduce((a, b) => a + b, 0),
            totalBookings: bookings.length,
            completedBookings: bookings.filter((b) => b.status === 'completed').length,
            cancelledBookings: bookings.filter((b) => b.status === 'cancelled').length,
            totalRevenue,
            avgRating: Math.round(avgRating * 10) / 10,
        },
        venues: venues.map((v) => ({
            _id: v._id,
            name: v.name,
            address: v.address,
            isActive: v.isActive,
            rating: v.rating,
            reviewCount: v.reviewCount,
            courtCount: courtCountMap[v._id.toString()] || 0,
            images: v.images,
        })),
    });
});
