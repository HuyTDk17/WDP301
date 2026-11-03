const crypto = require('crypto');
const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const User = require('../models/User');
const Notification = require('../models/Notification');
const TransferRequest = require('../models/TransferRequest');

const { getSettings } = require('../utils/platformSettings');
const { leadTimeHours } = require('../utils/timeSlots');
const ledger = require('../utils/ledger');
const withTransaction = require('../utils/withTransaction');

/**
 * SANG TÊN LƯỢT ĐẶT (loại T5).
 *
 * Biến thể đơn giản nhất của chuyển sân: giữ nguyên sân, ngày và giờ, chỉ đổi
 * người đứng tên. Dùng khi khách không đi được nhưng có bạn bè nhận lại suất.
 *
 * Vì không có gì thay đổi ngoài chủ sở hữu đơn, ở đây KHÔNG tạo đơn mới như
 * các loại T1–T4 mà cập nhật thẳng customerId của đơn hiện tại. Chủ sân không
 * bị ảnh hưởng nên cũng không có bồi thường, không có chênh lệch giá — chỉ có
 * một khoản phí cố định cho nền tảng.
 *
 * Việc hai bên tự thanh toán tiền sân với nhau nằm ngoài hệ thống; nền tảng
 * không can thiệp và cũng không giữ hộ.
 */

function fail(status, message) {
    const err = new Error(message);
    err.statusCode = status;
    throw err;
}

/** Mã 8 ký tự, bỏ các ký tự dễ đọc nhầm (0/O, 1/I) để đọc qua điện thoại được. */
function generateCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(8);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// ============================================================
// 1. NGƯỜI CHUYỂN TẠO MÃ
// ============================================================

async function createAssignment({ booking, user }) {
    const settings = await getSettings();
    if (!settings.transferEnabled) fail(422, 'Chức năng chuyển sân đang tạm ngưng');
    if (booking.status !== 'confirmed') fail(422, 'Chỉ lượt đặt đã xác nhận mới sang tên được');
    if (!booking.customerId) fail(422, 'Lượt đặt thủ công không hỗ trợ sang tên');

    const minLead = settings.transferMinLeadTimeHours ?? 2;
    const L = leadTimeHours(booking.date, booking.startTime);
    if (L < minLead) fail(422, `Chỉ sang tên được trước giờ đá ít nhất ${minLead} tiếng`);

    // Một đơn chỉ có một mã còn hiệu lực tại một thời điểm
    const existing = await TransferRequest.findOne({
        fromBookingId: booking._id, type: 'T5', status: 'quoted', quoteExpiresAt: { $gt: new Date() },
    });
    if (existing) return { transfer: existing, reused: true };

    const venue = await Venue.findById(booking.venueId).select('ownerId name');
    const fee = settings.transferFixedFeeT5 ?? 0;

    // Mã hết hạn sớm hơn trong hai mốc: 24 giờ nữa, hoặc đúng ngưỡng tối thiểu
    // trước giờ đá — để người nhận không lấy được suất khi đã quá sát giờ.
    const latestUsable = Date.now() + (L - minLead) * 3600000;
    const expiresAt = new Date(Math.min(Date.now() + 24 * 3600000, latestUsable));

    const paid = booking.amount + (booking.serviceFee || 0) - (booking.discountAmount || 0);

    const transfer = await TransferRequest.create({
        fromBookingId: booking._id,
        customerId: user._id,
        type: 'T5',
        transferCode: generateCode(),
        fromVenueId: booking.venueId, fromCourtId: booking.courtId, fromOwnerId: venue?.ownerId,
        fromVenueName: booking.venueName, fromCourtName: booking.courtName,
        fromDate: booking.date, fromStartTime: booking.startTime, fromEndTime: booking.endTime,
        // Điểm đến trùng điểm đi — chỉ đổi người đứng tên
        toVenueId: booking.venueId, toCourtId: booking.courtId, toOwnerId: venue?.ownerId,
        toVenueName: booking.venueName, toCourtName: booking.courtName,
        toDate: booking.date, toStartTime: booking.startTime, toEndTime: booking.endTime,
        quote: {
            leadTimeHours: Math.round(L * 100) / 100,
            oldAmount: booking.amount, oldServiceFee: booking.serviceFee,
            oldDiscount: booking.discountAmount, oldPaid: paid,
            newAmount: booking.amount, newServiceFee: booking.serviceFee,
            // Sang tên không đổi giá: giữ nguyên hoa hồng đã chốt trên đơn gốc
            newOwnerCommission: booking.ownerCommission || 0,
            commissionRate: (booking.commissionRate || 0) / 100,
            newDiscount: booking.discountAmount, newPayable: paid,
            transferFeeRate: 0, transferFee: fee,
            compensationRate: 0, compensation: 0,
            // Người NHẬN trả phí sang tên. Họ là bên được hưởng suất đã thanh
            // toán, còn tiền sân thì hai bên tự thoả thuận ngoài hệ thống.
            settlement: fee,
            direction: fee > 0 ? 'topup' : 'none',
            refundCash: 0, refundCredit: 0,
        },
        quoteExpiresAt: expiresAt,
        status: 'quoted',
    });

    return { transfer, reused: false };
}

// ============================================================
// 2. NGƯỜI NHẬN TRA MÃ
// ============================================================

async function lookupByCode(code, user) {
    const transfer = await TransferRequest.findOne({
        transferCode: String(code || '').trim().toUpperCase(), type: 'T5',
    }).populate('customerId', 'name avatar');

    if (!transfer) fail(404, 'Mã sang tên không đúng hoặc không tồn tại');
    if (transfer.status !== 'quoted') fail(409, 'Mã này đã được sử dụng hoặc đã bị huỷ');
    if (transfer.quoteExpiresAt < new Date()) {
        transfer.status = 'expired';
        await transfer.save();
        fail(410, 'Mã sang tên đã hết hạn');
    }
    if (String(transfer.customerId?._id || transfer.customerId) === String(user._id)) {
        fail(400, 'Đây là mã do chính bạn tạo, hãy gửi cho người bạn muốn chuyển suất');
    }

    return transfer;
}

// ============================================================
// 3. THỰC THI SANG TÊN
// ============================================================

/**
 * Đổi người đứng tên của đơn. Gọi sau khi người nhận đã trả phí (nếu có phí),
 * hoặc ngay lập tức nếu phí bằng 0.
 */
async function executeAssignment(transfer) {
    const booking = await Booking.findById(transfer.fromBookingId);
    if (!booking) fail(404, 'Không tìm thấy lượt đặt gốc');
    if (booking.status !== 'confirmed') fail(409, 'Lượt đặt gốc không còn hiệu lực');
    if (!transfer.toCustomerId) fail(400, 'Chưa xác định được người nhận suất');

    const receiver = await User.findById(transfer.toCustomerId).select('name');
    if (!receiver) fail(404, 'Không tìm thấy tài khoản người nhận');

    await withTransaction(async (session) => {
        const opt = session ? { session } : {};

        await Booking.updateOne({ _id: booking._id }, {
            customerId: transfer.toCustomerId,
            transferCount: (booking.transferCount || 0) + 1,
            transferFeeAmount: (booking.transferFeeAmount || 0) + (transfer.quote.transferFee || 0),
            rootBookingId: booking.rootBookingId || booking._id,
            // Ghi lại tên người nhận để chủ sân biết ai sẽ đến sân
            notes: [booking.notes, `Đã sang tên cho ${receiver.name}`].filter(Boolean).join(' · '),
        }, opt);

        await TransferRequest.updateOne({ _id: transfer._id }, {
            status: 'completed',
            toBookingId: booking._id,
            completedAt: new Date(),
            // Vô hiệu hoá mã để không ai dùng lại, đồng thời giải phóng ràng
            // buộc duy nhất cho các mã sinh sau này.
            transferCode: null,
        }, opt);
    });

    await notify(transfer, booking, receiver).catch((e) => console.error('notify:', e.message));

    return { transfer, booking };
}

async function notify(transfer, booking, receiver) {
    const when = `${transfer.fromDate} lúc ${transfer.fromStartTime}–${transfer.fromEndTime}`;
    await Notification.create([
        {
            userId: transfer.customerId,
            type: 'transfer', icon: '🤝',
            title: 'Đã sang tên lượt đặt thành công',
            message: `Suất tại "${transfer.fromVenueName} – ${transfer.fromCourtName}" ngày ${when} nay thuộc về ${receiver.name}. Lượt đặt này không còn hiển thị trong lịch sử của bạn.`,
            link: '/bookings',
        },
        {
            userId: transfer.toCustomerId,
            type: 'transfer', icon: '🎉',
            title: 'Bạn đã nhận được một suất đặt sân',
            message: `"${transfer.fromVenueName} – ${transfer.fromCourtName}" ngày ${when}. Suất đã được thanh toán đầy đủ, bạn chỉ cần đến đúng giờ.`,
            link: '/bookings',
        },
        {
            userId: transfer.fromOwnerId,
            type: 'transfer', icon: '🔁',
            title: 'Một lượt đặt đã đổi người đứng tên',
            message: `Lượt đặt ngày ${when} tại "${transfer.fromVenueName}" nay do ${receiver.name} đứng tên. Sân và khung giờ không thay đổi.`,
            link: '/owner/bookings',
        },
    ].filter((n) => n.userId));
}

/** Người tạo mã huỷ trước khi có ai nhận. */
async function cancelAssignment(transfer, reason = 'Người chuyển đã huỷ mã sang tên') {
    if (transfer.status !== 'quoted') fail(409, 'Mã này không còn ở trạng thái có thể huỷ');
    transfer.status = 'cancelled';
    transfer.failureReason = reason;
    transfer.transferCode = null;
    await transfer.save();
    return transfer;
}

module.exports = { createAssignment, lookupByCode, executeAssignment, cancelAssignment, generateCode };
