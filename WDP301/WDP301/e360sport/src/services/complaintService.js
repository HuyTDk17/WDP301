import api from './api'

// ============================================================
// complaintService — khiếu nại của khách gửi quản trị viên.
//
//   POST   /complaints                  (customer, multipart: bookingId|venueId, category, subject, description, evidence[≤5 ảnh])
//   GET    /complaints/my               (customer)
//   GET    /complaints/:id              (customer)
//   GET    /admin/complaints            ?status&search&page&limit  -> { complaints, total, totalPages, stats }
//   GET    /admin/complaints/:id        (admin)
//   PATCH  /admin/complaints/:id/start  (admin: nhận xử lý)
//   POST   /admin/complaints/:id/contact  { target: 'customer'|'owner', message }
//   POST   /admin/complaints/:id/resolve  { decision: 'resolved'|'rejected', resolution }
// ============================================================

export const COMPLAINT_CATEGORIES = [
  { value: 'service', label: 'Chất lượng dịch vụ' },
  { value: 'facility', label: 'Cơ sở vật chất' },
  { value: 'payment', label: 'Thanh toán' },
  { value: 'refund', label: 'Hoàn tiền' },
  { value: 'staff', label: 'Thái độ nhân viên' },
  { value: 'other', label: 'Khác' },
]
export const complaintCategoryLabel = (v) => COMPLAINT_CATEGORIES.find((c) => c.value === v)?.label || 'Khác'

export const complaintService = {
  create: (formData) => api.post('/complaints', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMine: (params = {}) => api.get('/complaints/my', { params }),
  getMineById: (id) => api.get(`/complaints/${id}`),

  // ── Admin ──
  adminList: (params = {}) => api.get('/admin/complaints', { params }),
  adminGet: (id) => api.get(`/admin/complaints/${id}`),
  adminStart: (id) => api.patch(`/admin/complaints/${id}/start`),
  adminContact: (id, target, message) => api.post(`/admin/complaints/${id}/contact`, { target, message }),
  adminResolve: (id, decision, resolution) => api.post(`/admin/complaints/${id}/resolve`, { decision, resolution }),
}
