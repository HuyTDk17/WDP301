import api from './api'

// ============================================================
// transferService — nghiệp vụ CHUYỂN SÂN.
//
// Luồng (xem backend/services/transferService.js):
//   1. getEligibility(bookingId)  → đơn có chuyển được không, còn bao nhiêu
//      giờ, biểu phí sẽ áp dụng. Gọi TRƯỚC khi cho khách đi tìm sân, để họ
//      biết chi phí trước khi mất công chọn.
//   2. createQuote(bookingId, target) → hệ thống giữ chỗ khung giờ đích 10
//      phút và trả về BẢNG CHI PHÍ đã chốt (breakdown). Toàn bộ phép tính nằm
//      ở máy chủ, frontend chỉ hiển thị.
//   3. confirm(transferId) → nếu phải bù tiền thì trả về hướng dẫn chuyển
//      khoản (số tài khoản, mã QR); nếu không thì chuyển xong luôn.
//   4. Khách chuyển khoản, bấm "Tôi đã chuyển khoản", quản trị viên (hoặc
//      webhook đối soát tự động) xác nhận — backend mới thực thi bước chuyển.
//
// Ở MỌI nhánh thất bại, đơn gốc luôn được giữ nguyên hiệu lực.
// ============================================================

export const transferService = {
  // ── Khách hàng ──
  getEligibility: (bookingId) => api.get(`/bookings/${bookingId}/transfer/eligibility`),
  createQuote: (bookingId, target) => api.post(`/bookings/${bookingId}/transfer/quote`, target),
  confirm: (transferId) => api.post(`/transfers/${transferId}/confirm`),
  cancel: (transferId) => api.post(`/transfers/${transferId}/cancel`),
  getById: (transferId) => api.get(`/transfers/${transferId}`),
  getMine: (params = {}) => api.get('/transfers/my', { params }),

  // ── Sang tên cho người khác (T5) ──
  // Giữ nguyên sân/ngày/giờ, chỉ đổi người đứng tên. Người chuyển tạo mã,
  // người nhận nhập mã. Tiền sân hai bên tự thoả thuận ngoài hệ thống.
  createAssignment: (bookingId) => api.post(`/bookings/${bookingId}/transfer/assign`),
  lookupAssignment: (code) => api.get(`/transfers/claim/${code}`),
  claimAssignment: (code) => api.post(`/transfers/claim/${code}`),
  cancelAssignment: (transferId) => api.post(`/transfers/${transferId}/cancel-assignment`),

  // ── Chủ sân ──
  getOwnerTransfers: (params = {}) => api.get('/owner/transfers', { params }),
  approve: (id) => api.post(`/owner/transfers/${id}/approve`),
  reject: (id, reason) => api.post(`/owner/transfers/${id}/reject`, { reason }),
  setVenuePolicy: (venueId, transferRequiresApproval) =>
    api.patch(`/owner/venues/${venueId}/transfer-policy`, { transferRequiresApproval }),

}

// Nhãn tiếng Việt cho từng trạng thái yêu cầu chuyển sân.
export const TRANSFER_STATUS = {
  quoted: { label: 'Chờ xác nhận', color: '#F59E0B', bg: '#FEF3C7' },
  awaiting_payment: { label: 'Chờ thanh toán', color: '#F59E0B', bg: '#FEF3C7' },
  awaiting_owner_approval: { label: 'Chờ chủ sân duyệt', color: '#3B82F6', bg: '#DBEAFE' },
  processing: { label: 'Đang xử lý', color: '#3B82F6', bg: '#DBEAFE' },
  completed: { label: 'Hoàn tất', color: '#22C55E', bg: '#DCFCE7' },
  rejected: { label: 'Bị từ chối', color: '#EF4444', bg: '#FEE2E2' },
  expired: { label: 'Hết hạn', color: '#8A94A6', bg: '#F1F5F9' },
  cancelled: { label: 'Đã huỷ', color: '#8A94A6', bg: '#F1F5F9' },
  failed: { label: 'Thất bại', color: '#EF4444', bg: '#FEE2E2' },
}

export const TRANSFER_TYPE_LABEL = {
  T1: 'Đổi khung giờ',
  T2: 'Đổi sân trong cùng địa điểm',
  T3: 'Đổi địa điểm (cùng chủ sân)',
  T4: 'Chuyển sang địa điểm khác',
  T5: 'Sang tên cho người khác',
}
