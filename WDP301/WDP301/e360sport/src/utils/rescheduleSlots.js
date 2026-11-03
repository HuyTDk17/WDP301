// Khung giờ cho chức năng ĐỔI LỊCH — hàm thuần (không phụ thuộc React) để kiểm thử được.
// Đổi lịch giữ nguyên độ dài lượt đặt: chọn giờ BẮT ĐẦU mới, giờ kết thúc = bắt đầu + độ dài cũ.

export const toMinutes = (t) => {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + (m || 0)
}

export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export const durationMinutes = (startTime, endTime) => toMinutes(endTime) - toMinutes(startTime)

/**
 * @param {object} p
 * @param {string} p.open, p.close     giờ mở/đóng cửa 'HH:MM'
 * @param {number} p.durationMin       độ dài lượt đặt (phút), giữ nguyên khi đổi
 * @param {string} p.date              ngày đang xem 'YYYY-MM-DD'
 * @param {string} p.courtId           sân đang xem
 * @param {{start:string,end:string,courtId?:string}[]} p.bookedSlots  các khung đã có người đặt (kể cả lượt đang đổi)
 * @param {{date:string,courtId:string,startTime:string,endTime:string}} p.original  lượt đặt đang đổi
 * @param {string} p.today             hôm nay 'YYYY-MM-DD'
 * @param {number} p.nowMinutes        số phút đã trôi qua trong ngày hôm nay
 * @returns {{start:string,end:string,isBooked:boolean,isPast:boolean}[]}
 */
export function buildRescheduleSlots({ open = '06:00', close = '22:00', durationMin = 60, date, courtId, bookedSlots = [], original, today, nowMinutes = 0 }) {
  const openMin = toMinutes(open)
  const closeMin = toMinutes(close)
  const sameDayAndCourt = !!original && date === original.date && String(courtId) === String(original.courtId)
  const isOwn = (b) => sameDayAndCourt && b.start === original.startTime && b.end === original.endTime

  const slots = []
  for (let start = openMin; start + durationMin <= closeMin; start += 60) {
    const end = start + durationMin
    // Đúng giờ hiện tại của lượt đặt: không cho chọn lại chính nó.
    const isCurrent = sameDayAndCourt && start === toMinutes(original.startTime)
    // Lượt đặt đang đổi không tự chặn mình (vd. dời sớm 1 giờ khi đang đặt 2 giờ).
    const isBooked = isCurrent || bookedSlots.some((b) => !isOwn(b) && toMinutes(b.start) < end && toMinutes(b.end) > start)
    const isPast = date === today && start <= nowMinutes
    slots.push({ start: toHHMM(start), end: toHHMM(end), isBooked, isPast })
  }
  return slots
}
