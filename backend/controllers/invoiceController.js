const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const User = require('../models/User');
const Payment = require('../models/Payment');
const asyncHandler = require('../utils/asyncHandler');
const { getSettings } = require('../utils/platformSettings');
const { buildInvoice, INVOICEABLE_STATUSES } = require('../utils/invoice');

// @route   GET /api/bookings/:id/invoice   (customer)
// Dữ liệu hóa đơn của MỘT lượt đặt của chính khách. Giao diện hiển thị và cho in / lưu PDF.
exports.getInvoice = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy lượt đặt sân này' });
    // Chặn IDOR: khách chỉ xem được hóa đơn của chính mình.
    if (String(booking.customerId || '') !== String(req.user._id)) {
        return res.status(403).json({ message: 'Bạn không có quyền xem hóa đơn này' });
    }
    if (!INVOICEABLE_STATUSES.includes(booking.status)) {
        return res.status(422).json({ message: 'Chỉ lượt đặt đã xác nhận hoặc đã hoàn tất mới có hóa đơn' });
    }

    const venue = await Venue.findById(booking.venueId);
    const [owner, payment, settings] = await Promise.all([
        venue ? User.findById(venue.ownerId).select('name') : null,
        Payment.findOne({ bookingId: booking._id, purpose: 'booking', status: 'completed' }).sort({ createdAt: -1 }),
        getSettings(),
    ]);

    res.json({ invoice: buildInvoice({ booking, venue, owner, customer: req.user, payment, settings }) });
});
