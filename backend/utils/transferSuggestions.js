/**
 * GỢI Ý SÂN THAY THẾ cho chuyển sân — phần thuần (không đụng CSDL) để kiểm thử được.
 *
 * Quy tắc: cùng môn, cùng ngày, GIỮ NGUYÊN độ dài lượt đặt, giờ bắt đầu lệch tối đa ±MAX_SHIFT_HOURS so với giờ gốc
 * (bước 1 giờ), nằm trọn trong giờ mở cửa. Ưu tiên giờ gần giờ gốc nhất, rồi cùng địa điểm, rồi giá gần giá cũ.
 */
const { toMinutes } = require('./timeSlots');

const MAX_SHIFT_HOURS = 2;
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Các khung giờ ứng viên quanh giờ gốc, sắp theo độ lệch tăng dần (0, -1h, +1h, -2h, +2h). */
function candidateWindows({ startTime, endTime, open = '06:00', close = '22:00', maxShiftHours = MAX_SHIFT_HOURS }) {
    const duration = toMinutes(endTime) - toMinutes(startTime);
    if (!(duration > 0)) return [];
    const openMin = toMinutes(open);
    const closeMin = toMinutes(close);
    const origin = toMinutes(startTime);
    const out = [];
    for (let k = 0; k <= maxShiftHours; k += 1) {
        for (const sign of (k === 0 ? [0] : [-1, 1])) {
            const start = origin + sign * k * 60;
            const end = start + duration;
            if (start >= openMin && end <= closeMin && start >= 0 && end <= 24 * 60) {
                out.push({ startTime: hhmm(start), endTime: hhmm(end), shiftMinutes: sign * k * 60 });
            }
        }
    }
    return out;
}

/** Sắp xếp + cắt danh sách gợi ý. */
function rankSuggestions(items, limit = 10) {
    return [...items]
        .sort((a, b) =>
            Math.abs(a.shiftMinutes) - Math.abs(b.shiftMinutes)
            || (a.sameVenue === b.sameVenue ? 0 : (a.sameVenue ? -1 : 1))
            || Math.abs(a.priceDiff) - Math.abs(b.priceDiff)
            || String(a.venueName).localeCompare(String(b.venueName)))
        .slice(0, limit);
}

module.exports = { candidateWindows, rankSuggestions, MAX_SHIFT_HOURS };
