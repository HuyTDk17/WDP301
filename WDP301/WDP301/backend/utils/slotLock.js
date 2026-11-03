const SlotLock = require('../models/SlotLock');
const { slotIndices } = require('./timeSlots');

/**
 * Giành khung giờ bằng ràng buộc DUY NHẤT ở cấp cơ sở dữ liệu.
 *
 * Trả về true nếu giành được. Nếu bất kỳ ô 30 phút nào đã có người giữ,
 * MongoDB ném lỗi trùng khoá (E11000) và hàm trả về false — không còn khoảng
 * trống nào giữa "kiểm tra" và "ghi" để hai yêu cầu đồng thời cùng lọt qua.
 */
async function acquire({ courtId, date, startTime, endTime, bookingId }, session = null) {
    const docs = slotIndices(startTime, endTime).map((slotIndex) => ({ courtId, date, slotIndex, bookingId }));
    if (!docs.length) return false;
    try {
        await SlotLock.create(docs, session ? { session, ordered: true } : { ordered: true });
        return true;
    } catch (err) {
        if (err?.code === 11000 || err?.writeErrors?.some((e) => e.code === 11000)) return false;
        throw err;
    }
}

/** Trả khung giờ về trạng thái trống (huỷ đơn, chuyển đơn đi nơi khác). */
async function release(bookingId, session = null) {
    const q = SlotLock.deleteMany({ bookingId });
    if (session) q.session(session);
    return q;
}

/** Khung giờ này có đang bị chiếm không (dùng cho bước xem trước/báo giá). */
async function isTaken({ courtId, date, startTime, endTime, excludeBookingId = null }) {
    const indices = slotIndices(startTime, endTime);
    if (!indices.length) return true;
    const filter = { courtId, date, slotIndex: { $in: indices } };
    if (excludeBookingId) filter.bookingId = { $ne: excludeBookingId };
    return !!(await SlotLock.findOne(filter));
}

module.exports = { acquire, release, isTaken };
