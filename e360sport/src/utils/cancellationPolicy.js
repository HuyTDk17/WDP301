// Tiện ích hiển thị & kiểm tra nhanh chính sách hủy ở frontend (hàm thuần).
// Quy tắc "sàn" khớp với backend (backend/utils/cancellationPolicy.js); máy chủ vẫn là nơi quyết định cuối cùng.

const sortDesc = (tiers) => [...(tiers || [])].sort((a, b) => b.minLeadHours - a.minLeadHours)

/** Tỉ lệ hoàn tại một mốc giờ báo trước: bậc có minLeadHours LỚN NHẤT mà vẫn ≤ giờ báo (không có thì lấy bậc thấp nhất). */
export function rateAt(tiers, lead) {
  const sorted = sortDesc(tiers)
  const tier = sorted.find((t) => lead >= t.minLeadHours) || sorted[sorted.length - 1]
  return tier ? Number(tier.refundRate) || 0 : 0
}

const pct = (r) => `${Math.round(r * 100)}%`

/** Thông báo nếu biểu của chủ sân khắt khe hơn sàn ở mốc nào đó, ngược lại null. */
export function floorViolation(tiers, floorTiers) {
  if (!Array.isArray(floorTiers) || floorTiers.length === 0 || !tiers.length) return null
  const points = [...new Set([0, ...tiers.map((t) => Number(t.minLeadHours)), ...floorTiers.map((t) => t.minLeadHours)])].sort((a, b) => b - a)
  for (const lead of points) {
    const mine = rateAt(tiers, lead)
    const floor = rateAt(floorTiers, lead)
    if (mine < floor) return `Báo hủy trước ${lead} giờ: nền tảng yêu cầu hoàn tối thiểu ${pct(floor)} (bạn đang đặt ${pct(mine)})`
  }
  return null
}

/** Biểu → các dòng dễ đọc cho khách: [{ when: 'Báo trước từ 24 giờ', rate: 1 }, ...] */
export function describeTiers(tiers) {
  const sorted = sortDesc(tiers)
  return sorted.map((t, i) => {
    const prev = sorted[i - 1]
    let when
    if (sorted.length === 1) when = 'Mọi thời điểm'
    else if (i === 0) when = `Báo trước từ ${t.minLeadHours} giờ`
    else if (t.minLeadHours === 0) when = `Báo trước dưới ${prev.minLeadHours} giờ`
    else when = `Báo trước từ ${t.minLeadHours} đến dưới ${prev.minLeadHours} giờ`
    return { when, rate: Number(t.refundRate) || 0 }
  })
}
