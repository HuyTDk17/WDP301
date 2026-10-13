import api from './api'

// ============================================================
// networkService — MẠNG LƯỚI CHUYỂN SÂN (chuyển lượt đặt sang chủ sân khác).
//
// Chủ sân:  GET /owner/network            → { required, status, requestedAt, reviewedAt, note }
//           POST /owner/network/request   → xin tham gia
// Admin:    GET /admin/network?status&search&page&limit → { required, owners[], stats, total, totalPages }
//           PATCH /admin/network/:ownerId { action: 'approve'|'reject'|'revoke', reason }
//           POST /admin/network/approve-pending → { approved }
// status: none | pending | approved | rejected | revoked
// Chỉ có tác dụng khi Admin bật "transferNetworkRequired" trong Cài đặt; tắt = mọi chủ sân tự động tham gia.
// ============================================================

export const NETWORK_STATUS_LABEL = {
  none: 'Chưa tham gia',
  pending: 'Chờ duyệt',
  approved: 'Thành viên',
  rejected: 'Bị từ chối',
  revoked: 'Đã gỡ',
}

export const networkService = {
  getMine: () => api.get('/owner/network'),
  requestToJoin: () => api.post('/owner/network/request'),

  adminList: (params = {}) => api.get('/admin/network', { params }),
  adminReview: (ownerId, action, reason = '') => api.patch(`/admin/network/${ownerId}`, { action, reason }),
  adminApprovePending: () => api.post('/admin/network/approve-pending'),
}
