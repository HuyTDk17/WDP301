/**
 * Tiện ích dùng chung cho khung giờ (slot 30 phút) và khoá slot.
 */

export const timeToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Các slotIndex nằm trong khoảng [start, end). 17:00 → 34. */
export const slotIndexesBetween = (start: string, end: string): number[] => {
  const indexes: number[] = [];
  for (let m = timeToMinutes(start); m < timeToMinutes(end); m += 30) {
    indexes.push(Math.floor(m / 30));
  }
  return indexes;
};

/**
 * Điều kiện "khoá còn hiệu lực": khoá của booking (không có hạn)
 * hoặc khoá giữ chỗ tạm chưa hết hạn.
 */
export const activeLockFilter = (now: Date = new Date()) => ({
  $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
});

/** Điều kiện "khoá giữ chỗ tạm đã hết hạn" (dọn trước khi khoá slot mới). */
export const expiredLockFilter = (now: Date = new Date()) => ({
  expiresAt: { $ne: null, $lte: now },
});

/** Giờ bắt đầu của booking theo giờ Việt Nam (UTC+7). */
export const bookingStartAt = (date: string, startTime: string): Date =>
  new Date(`${date}T${startTime}:00+07:00`);
