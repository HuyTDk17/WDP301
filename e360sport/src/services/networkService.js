import api from './api'

// ============================================================
// networkService — MẠNG LƯỚI CHUYỂN SÂN (chuyển lượt đặt sang chủ sân khác).
//
// Chủ sân:  GET /owner/network            → { required, status, requestedAt, reviewedAt, note }
//           POST /owner/network/request   → xin tham gia
//           POST /owner/network/respond { accept } → trả lời lời mời của Admin
// Admin:    GET /admin/network?status&search&page&limit → { required, owners[], stats, total, totalPages }
//           PATCH /admin/network/:ownerId { action: 'approve'|'reject'|'revoke', reason }
//           POST /admin/network/approve-pending → { approved }
//           POST /admin/network/:ownerId/invite → mời chủ sân (status 'none') tham gia, chủ sân nhận thông báo
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
  // Trả lời lời mời của Admin: accept=true → vào mạng lưới, false → từ chối
  respondToInvite: (accept) => api.post('/owner/network/respond', { accept }),

  adminList: (params = {}) => api.get('/admin/network', { params }),
  adminReview: (ownerId, action, reason = '') => api.patch(`/admin/network/${ownerId}`, { action, reason }),
  adminApprovePending: () => api.post('/admin/network/approve-pending'),
  // Hỏi ý kiến chủ sân chưa tham gia (gửi thông báo mời), thay cho việc duyệt thẳng
  adminInvite: (ownerId) => api.post(`/admin/network/${ownerId}/invite`),
}
