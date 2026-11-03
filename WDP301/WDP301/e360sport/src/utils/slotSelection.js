// ============================================================
// Chọn NHIỀU khung giờ LIỀN NHAU khi đặt sân (ví dụ 18:00, 19:00, 20:00 → 18:00–21:00 = 3 giờ).
// Hàm thuần, không phụ thuộc React để dễ kiểm thử. Máy chủ vẫn kiểm tra lại toàn bộ (khoảng giờ, trùng lịch, giá).
// ============================================================

/** Số ô tối đa một lượt đặt (mỗi ô = 1 giờ). Chỉ là giới hạn giao diện cho gọn; đổi tại đây nếu muốn nới. */
export const MAX_BOOKING_SLOTS = 8

const toMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }

/**
 * Bấm vào một ô → trả về danh sách ô đang chọn mới (luôn liền nhau, theo thứ tự).
 *  - chưa chọn gì              → chọn ô đó
 *  - bấm ô chưa chọn           → nối dài từ vùng đang chọn tới ô đó, NẾU mọi ô ở giữa còn trống và không vượt trần;
 *                                 ngược lại bắt đầu lại từ ô vừa bấm (không bao giờ chọn vắt qua ô đã đặt)
 *  - bấm ô đầu/cuối đang chọn  → bỏ ô đó (thu ngắn lại)
 *  - bấm ô giữa đang chọn      → giữ từ ô đầu tới ô vừa bấm
 *  - bấm ô đã đặt / đã qua     → không đổi gì
 */
export function toggleSlotSelection(selected, slot, slots, max = MAX_BOOKING_SLOTS) {
  const indexOf = (s) => slots.findIndex((x) => x.start === s.start)
  const clicked = indexOf(slot)
  if (clicked < 0 || slots[clicked].isBooked || slots[clicked].isPast) return selected

  const picked = selected.map(indexOf).filter((i) => i >= 0).sort((a, b) => a - b)
  if (picked.length === 0) return [slots[clicked]]

  const first = picked[0]
  const last = picked[picked.length - 1]
  const range = (from, to) => slots.slice(from, to + 1)

  if (picked.includes(clicked)) {
    if (picked.length === 1) return []
    if (clicked === last) return range(first, last - 1)
    if (clicked === first) return range(first + 1, last)
    return range(first, clicked)
  }

  const extended = range(Math.min(first, clicked), Math.max(last, clicked))
  const free = extended.every((s) => !s.isBooked && !s.isPast)
  return free && extended.length <= max ? extended : [slots[clicked]]
}

/** Các ô đã chọn → { start, end, hours } (null nếu chưa chọn). Giả định các ô liền nhau, đã sắp theo thời gian. */
export function summarizeSlots(selected) {
  if (!selected || selected.length === 0) return null
  const start = selected[0].start
  const end = selected[selected.length - 1].end
  return { start, end, hours: (toMinutes(end) - toMinutes(start)) / 60 }
}

/** Tiền sân = đơn giá theo giờ × số giờ — cùng cách làm tròn với máy chủ (utils/timeSlots.calculateAmount). */
export const courtAmount = (pricePerHour, hours) => Math.round((Number(pricePerHour) || 0) * (Number(hours) || 0))
