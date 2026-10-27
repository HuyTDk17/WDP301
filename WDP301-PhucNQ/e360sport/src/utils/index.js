import { format, parseISO, isToday, isTomorrow, addDays, startOfDay } from 'date-fns'

// === XỬ LÝ NGÀY GIỜ ===
// Ngày theo GIỜ ĐỊA PHƯƠNG dạng yyyy-MM-dd. KHÔNG dùng toISOString() cho việc này: nó đổi sang UTC
// nên ở Việt Nam (UTC+7) 00:00–07:00 sáng sẽ ra ngày hôm qua, và đầu ngày địa phương luôn lệch về ngày trước.
export const toLocalISODate = (d = new Date()) => format(d, 'yyyy-MM-dd')

export const formatDate = (date, fmt = 'dd/MM/yyyy') =>
  format(typeof date === 'string' ? parseISO(date) : date, fmt)

export const formatTime = (time) => {
  const [h, m] = time.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const formatDateRelative = (date) => {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (isToday(d)) return 'Hôm nay'
  if (isTomorrow(d)) return 'Ngày mai'
  return formatDate(d)
}

export const getNext30Days = () =>
  Array.from({ length: 30 }, (_, i) => addDays(startOfDay(new Date()), i))

// === TIỀN TỆ ===
export const formatCurrency = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)

export const formatCompactNumber = (num) => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)} tỷ`
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)} triệu`
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)} nghìn`
  return num.toString()
}

// === CHUỖI ===
export const slugify = (str) =>
  str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')

export const capitalize = (str) =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()

export const truncate = (str, n = 100) =>
  str.length > n ? str.slice(0, n) + '...' : str

export const initials = (name) =>
  name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

// === KIỂM TRA HỢP LỆ ===
export const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
export const validatePhone = (phone) => /^(\+84|0)[3-9]\d{8}$/.test(phone.replace(/\s/g, ''))
export const validatePassword = (pw) => pw.length >= 8

// === MÔN THỂ THAO ===
export const SPORTS = [
  { id: 'football', name: 'Bóng đá', icon: '⚽', color: '#22C55E' },
  { id: 'basketball', name: 'Bóng rổ', icon: '🏀', color: '#F59E0B' },
  { id: 'badminton', name: 'Cầu lông', icon: '🏸', color: '#0A84FF' },
  { id: 'tennis', name: 'Tennis', icon: '🎾', color: '#FF6B2B' },
  { id: 'volleyball', name: 'Bóng chuyền', icon: '🏐', color: '#8B5CF6' },
  { id: 'swimming', name: 'Bơi lội', icon: '🏊', color: '#06B6D4' },
  { id: 'gym', name: 'Gym', icon: '🏋️', color: '#EF4444' },
  { id: 'yoga', name: 'Yoga', icon: '🧘', color: '#EC4899' },
]

export const getSport = (id) => SPORTS.find(s => s.id === id)

// === TRẠNG THÁI ĐẶT SÂN ===
export const BOOKING_STATUS = {
  pending: { label: 'Chờ xác nhận', color: '#F59E0B', bg: '#FEF3C7' },
  confirmed: { label: 'Đã xác nhận', color: '#22C55E', bg: '#DCFCE7' },
  cancelled: { label: 'Đã hủy', color: '#EF4444', bg: '#FEE2E2' },
  completed: { label: 'Hoàn tất', color: '#0A84FF', bg: '#E8F4FF' },
  no_show: { label: 'Không đến', color: '#8A94A6', bg: '#F1F5F9' },
  awaiting_payment: { label: 'Chờ thanh toán', color: '#F59E0B', bg: '#FEF3C7' },
  // Đơn đã được chuyển sang sân/địa điểm khác. Không bị xóa để giữ lịch sử và
  // để chủ sân cũ vẫn đối chiếu được khoản bồi thường.
  transferred: { label: 'Đã chuyển sân', color: '#8B5CF6', bg: '#F3E8FF' },
}

// === ẢNH ===
// Ảnh do server lưu chỉ trả về đường dẫn tương đối (VD: /uploads/xyz.jpg).
// Phải ghép với gốc domain của BACKEND (không phải domain frontend đang chạy),
// nếu không trình duyệt sẽ đi tìm ảnh ngay trên domain frontend và luôn ra lỗi 404.
const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:9999/api').replace(/\/api\/?$/, '')

export const getImageUrl = (path) => {
  if (!path) return ''
  // Avatar dựng sẵn: 'preset:avatar-03' -> file SVG trong thư mục public/avatars
  if (path.startsWith('preset:')) return `${import.meta.env.BASE_URL}avatars/${path.slice(7)}.svg`
  // URL tuyệt đối (http/https) hoặc blob: (ảnh preview vừa chọn, chưa upload) thì giữ nguyên
  if (/^(https?:|blob:|data:)/.test(path)) return path
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export const getAvatarPlaceholder = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0A84FF&color=fff&bold=true`

// === KHÁC ===
export const clsx = (...classes) => classes.filter(Boolean).join(' ')

export const generateTimeSlots = (open = '06:00', close = '22:00', interval = 60) => {
  const slots = []
  const [oh, om] = open.split(':').map(Number)
  const [ch, cm] = close.split(':').map(Number)
  let current = oh * 60 + om
  const end = ch * 60 + cm

  while (current < end) {
    const h = Math.floor(current / 60).toString().padStart(2, '0')
    const m = (current % 60).toString().padStart(2, '0')
    const endMinutes = current + interval
    const eh = Math.floor(endMinutes / 60).toString().padStart(2, '0')
    const em = (endMinutes % 60).toString().padStart(2, '0')
    slots.push({ start: `${h}:${m}`, end: `${eh}:${em}`, label: `${formatTime(`${h}:${m}`)} – ${formatTime(`${eh}:${em}`)}` })
    current += interval
  }
  return slots
}

/**
 * Sinh danh sách khung giờ cố định cho 1 sân vào 1 ngày cụ thể, đối chiếu với
 * các khung giờ đã có người đặt (bookedSlots, lấy từ API) và tự khóa các khung
 * giờ đã qua nếu ngày được chọn là hôm nay.
 *
 * @param {string} open - giờ mở cửa 'HH:mm'
 * @param {string} close - giờ đóng cửa 'HH:mm'
 * @param {number} interval - độ dài 1 khung giờ (phút), mặc định 60
 * @param {string} date - ngày đang xem 'YYYY-MM-DD'
 * @param {Array<{start: string, end: string}>} bookedSlots - khung giờ đã có người đặt
 * @returns {Array<{start, end, label, isBooked, isPast}>}
 */
export const buildAvailableSlots = (open, close, interval, date, bookedSlots = []) => {
  const allSlots = generateTimeSlots(open, close, interval)
  const today = toLocalISODate()
  const isToday = date === today
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  return allSlots.map(slot => {
    const [sh, sm] = slot.start.split(':').map(Number)
    const slotMinutes = sh * 60 + sm
    const isBooked = bookedSlots.some(b => b.start === slot.start)
    const isPast = isToday && slotMinutes <= nowMinutes
    return { ...slot, isBooked, isPast }
  })
}

/**
 * Format số liệu THẬT (từ /api/stats/public) cho gọn — chỉ thêm "+" khi số đủ
 * lớn để ngụ ý "làm tròn xuống", số nhỏ hiển thị đúng số thật vì thêm "+" vào
 * số nhỏ đọc giả tạo hơn là đáng tin. Dùng chung cho Home.jsx và AuthLayout.jsx.
 */
export const formatStatNumber = (n = 0) => {
  if (n >= 1000) return `${Math.floor(n / 1000)}K+`
  if (n >= 20) return `${Math.floor(n / 10) * 10}+`
  return String(n)
}

/**
 * Hoa hồng nền tảng trên một đơn và phần KHÁCH phải trả thêm — cùng công thức với
 * backend (utils/commission.js). Chỉ để XEM TRƯỚC giá; số tiền thật do máy chủ chốt.
 *   total      = giá sân × tỉ lệ hoa hồng
 *   serviceFee = phần khách chịu (cộng thêm vào giá); phần còn lại do chủ sân chịu
 */
export const previewCommission = (price, ratePct = 0, customerSharePct = 0) => {
  const total = Math.round((price || 0) * (Number(ratePct) || 0) / 100)
  const serviceFee = Math.round(total * (Number(customerSharePct) || 0) / 100)
  return { total, serviceFee, ownerCommission: total - serviceFee }
}

