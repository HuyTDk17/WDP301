// Nguồn: SDS mục I.3 (schema các collection). Một chỗ duy nhất định nghĩa nhãn + màu.
// color: giá trị của MUI Chip (default | primary | success | warning | error | info)
export const STATUS_CONFIG = {
  booking: {
    pending_confirmation: { label: 'Chờ xác nhận', color: 'warning' },
    confirmed: { label: 'Đã xác nhận', color: 'success' },
    completed: { label: 'Hoàn thành', color: 'primary' },
    cancelled: { label: 'Đã hủy', color: 'error' },
    rescheduled: { label: 'Đã đổi lịch', color: 'info' },
  },
  payment: {
    pending: { label: 'Chờ thanh toán', color: 'warning' },
    paid: { label: 'Đã thanh toán', color: 'success' },
    failed: { label: 'Thanh toán thất bại', color: 'error' },
    refunded: { label: 'Đã hoàn tiền', color: 'info' },
  },
  slot: {
    available: { label: 'Còn trống', color: 'success' },
    held: { label: 'Đang giữ chỗ', color: 'warning' },
    booked: { label: 'Đã đặt', color: 'error' },
    released: { label: 'Đã nhả', color: 'default' },
  },
  field: {
    pending_approval: { label: 'Chờ duyệt', color: 'warning' },
    approved: { label: 'Đã duyệt', color: 'success' },
    rejected: { label: 'Bị từ chối', color: 'error' },
    hidden: { label: 'Đang ẩn', color: 'default' },
    deleted: { label: 'Đã xóa', color: 'default' },
  },
  ownerApplication: {
    submitted: { label: 'Đã nộp', color: 'info' },
    under_review: { label: 'Đang xét duyệt', color: 'warning' },
    approved: { label: 'Đã duyệt', color: 'success' },
    rejected: { label: 'Bị từ chối', color: 'error' },
  },
  complaint: {
    submitted: { label: 'Đã gửi', color: 'info' },
    investigating: { label: 'Đang điều tra', color: 'warning' },
    resolved: { label: 'Đã giải quyết', color: 'success' },
  },
  transfer: {
    requested: { label: 'Đã yêu cầu', color: 'info' },
    slot_held: { label: 'Đã giữ chỗ', color: 'warning' },
    approved: { label: 'Đã chấp thuận', color: 'success' },
    rejected: { label: 'Bị từ chối', color: 'error' },
    completed: { label: 'Hoàn tất', color: 'primary' },
    expired: { label: 'Hết hạn', color: 'default' },
  },
  match: {
    open: { label: 'Đang mở', color: 'success' },
    matched: { label: 'Đã ghép', color: 'primary' },
    closed: { label: 'Đã đóng', color: 'default' },
  },
  voucher: {
    active: { label: 'Đang hoạt động', color: 'success' },
    expired: { label: 'Hết hạn', color: 'default' },
    deactivated: { label: 'Đã tắt', color: 'error' },
  },
  event: {
    upcoming: { label: 'Sắp diễn ra', color: 'info' },
    ongoing: { label: 'Đang diễn ra', color: 'success' },
    completed: { label: 'Đã kết thúc', color: 'default' },
    cancelled: { label: 'Đã hủy', color: 'error' },
  },
  news: {
    draft: { label: 'Bản nháp', color: 'default' },
    published: { label: 'Đã đăng', color: 'success' },
    archived: { label: 'Lưu trữ', color: 'default' },
  },
  user: {
    pending_verification: { label: 'Chờ xác thực email', color: 'warning' },
    active: { label: 'Đang hoạt động', color: 'success' },
    locked: { label: 'Đã khóa', color: 'error' },
  },
  membership: {
    none: { label: 'Chưa tham gia', color: 'default' },
    requested: { label: 'Đã yêu cầu', color: 'info' },
    approved: { label: 'Đã duyệt', color: 'success' },
    rejected: { label: 'Bị từ chối', color: 'error' },
    active: { label: 'Đang hoạt động', color: 'success' },
  },
};
