const Venue = require('../models/Venue');
const Booking = require('../models/Booking');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const LedgerEntry = require('../models/LedgerEntry');
const { ownerNetOf } = require('../utils/commission');

exports.getOwnerStats = asyncHandler(async (req, res) => {
    const venues = await Venue.find({ ownerId: req.user._id });
    const venueIds = venues.map((v) => v._id);
    const bookings = await Booking.find({ venueId: { $in: venueIds } });
    const totalRevenue = bookings.reduce((sum, b) => {
        // Doanh thu chủ sân = giá sân trừ hoa hồng chủ sân chịu (thực nhận)
        if (['completed', 'confirmed'].includes(b.status)) return sum + ownerNetOf(b);
        if (b.status === 'transferred') return sum + (b.compensationAmount || 0);
        return sum;
    }, 0);

    res.json({
        totalVenues: venues.length,
        activeVenues: venues.filter((v) => v.isActive).length,
        totalBookings: bookings.length,
        pendingBookings: bookings.filter((b) => b.status === 'awaiting_payment').length,
        totalRevenue,
    });
});

exports.getOwnerRevenue = asyncHandler(async (req, res) => {
    const venues = await Venue.find({ ownerId: req.user._id }).select('_id');
    const venueIds = venues.map((v) => v._id);
    // Gồm cả đơn đã CHUYỂN ĐI: chủ sân vẫn nhận khoản bồi thường nên phải hiện
    // ra, nếu không họ sẽ không hiểu vì sao công nợ thay đổi.
    const bookings = await Booking.find({
        venueId: { $in: venueIds },
        status: { $in: ['completed', 'confirmed', 'transferred'] },
    }).select('date amount serviceFee ownerCommission compensationAmount cancellationFee status paymentMethod');

    const monthly = {};
    bookings.forEach((b) => {
        const month = b.date?.slice(0, 7) || 'unknown';
        const m = (monthly[month] ||= { booking: 0, compensation: 0, fee: 0 });
        if (b.status === 'transferred') m.compensation += b.compensationAmount || 0;
        else {
            m.booking += ownerNetOf(b); // thực nhận, đã trừ phí dịch vụ chủ sân chịu
            if (b.paymentMethod !== 'manual') m.fee += (b.serviceFee || 0) + (b.ownerCommission || 0); // đơn thu tại quầy không tính phí
        }
    });

    res.json({
        revenue: Object.entries(monthly)
            .map(([month, d]) => ({ month, amount: d.booking + d.compensation, bookingRevenue: d.booking, compensation: d.compensation, fee: d.fee }))
            .sort((a, b) => a.month.localeCompare(b.month)),
    });
});

exports.getAdminStats = asyncHandler(async (req, res) => {
    const [totalUsers, totalOwners, totalVenues, totalBookings, pendingOwners] = await Promise.all([
        User.countDocuments({ role: 'customer' }),
        User.countDocuments({ role: 'owner' }),
        Venue.countDocuments(),
        Booking.countDocuments(),
        // Hồ sơ chủ sân đang chờ duyệt: role vẫn là 'customer' cho tới khi được duyệt,
        // nên phải lọc theo ownerApplicationStatus chứ không phải role.
        User.countDocuments({ ownerApplicationStatus: 'pending' }),
    ]);
    res.json({ totalUsers, totalOwners, totalVenues, totalBookings, pendingOwners });
});

/**
 * Doanh thu nền tảng theo tháng.
 *
 * TRƯỚC ĐÂY: revenue += round(b.amount * commissionRate) — tức là nhân lại
 * theo tỉ lệ hoa hồng TẠI THỜI ĐIỂM CHẠY BÁO CÁO. Hệ quả: quản trị viên hạ
 * hoa hồng từ 5% xuống 3% thì toàn bộ số liệu các tháng ĐÃ ĐỐI SOÁT lập tức
 * bị tính lại theo 3%. Ngoài ra công thức cũ bỏ qua chi phí khuyến mãi nên
 * doanh thu báo cáo luôn cao hơn thực tế.
 *
 * GIỜ: đọc giá trị đã CHỐT trên từng đơn (serviceFee − discountAmount), và trừ các khoản chi thực (phí cổng). Phí chuyển sân thuộc về chủ sân nên
 * KHÔNG tính vào doanh thu nền tảng.
 */
exports.getAdminRevenue = asyncHandler(async (req, res) => {
    const bookings = await Booking.find({ status: { $in: ['completed', 'confirmed', 'transferred'] } })
        .select('date amount serviceFee ownerCommission discountAmount status');

    const monthly = {};
    const bucket = (m) => (monthly[m] ||= { revenue: 0, grossRevenue: 0, promotionCost: 0, bookings: 0, gmv: 0 });

    bookings.forEach((b) => {
        const month = b.date?.slice(0, 7) || 'unknown';
        const m = bucket(month);
        // Đơn đã chuyển đi KHÔNG tính doanh thu lần hai — phí dịch vụ của nó đã
        // được thay bằng phí dịch vụ của đơn mới.
        if (b.status !== 'transferred') {
            // Hoa hồng nền tảng = phần khách chịu + phần chủ sân chịu
            m.grossRevenue += (b.serviceFee || 0) + (b.ownerCommission || 0);
            m.promotionCost += b.discountAmount || 0;
            m.gmv += b.amount || 0;
            m.bookings += 1;
        }
    });

    // Các khoản CHI thực, lấy từ sổ cái
    const costs = await LedgerEntry.aggregate([
        { $match: { entryType: 'gateway_fee' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$occurredAt' } }, total: { $sum: '$amount' } } },
    ]);
    const costByMonth = Object.fromEntries(costs.map((c) => [c._id, c.total]));

    const revenue = Object.entries(monthly).map(([month, d]) => {
        const netCost = costByMonth[month] || 0;
        return {
            month,
            bookings: d.bookings,
            gmv: d.gmv,
            grossRevenue: d.grossRevenue,
            promotionCost: d.promotionCost,
            operatingCost: netCost,
            revenue: d.grossRevenue - d.promotionCost - netCost,
        };
    }).sort((a, b) => a.month.localeCompare(b.month));

    res.json({ revenue });
});

exports.getUserStats = asyncHandler(async (req, res) => {
    // Loại trừ tài khoản admin khỏi mọi số liệu — nhất quán với getUsers (trang
    // Quản lý người dùng không liệt kê/đếm tài khoản admin).
    const base = { role: { $ne: 'admin' } };
    const total = await User.countDocuments(base);
    const active = await User.countDocuments({ ...base, status: { $in: ['active', 'verified'] } });
    const pending = await User.countDocuments({ ...base, status: 'pending' });
    const banned = await User.countDocuments({ ...base, status: 'banned' });
    res.json({ total, active, pending, banned });
});
