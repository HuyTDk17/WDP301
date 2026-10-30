import api from './api'

// ============================================================
// premiumService — GÓI PREMIUM (Venue Premium cho chủ sân, Premium Player cho người chơi).
// Tiền gói vào tài khoản nền tảng; xác nhận tự động qua webhook ngân hàng hoặc admin đối chiếu.
// ============================================================
export const premiumService = {
  getPlans: () => api.get('/premium/plans'),
  getMine: () => api.get('/premium/me'),
  createOrder: () => api.post('/premium/orders'),
  reportPaid: (id) => api.post(`/premium/orders/${id}/report`),
  cancelOrder: (id) => api.post(`/premium/orders/${id}/cancel`),

  // ── Quản trị viên ──
  adminStats: () => api.get('/admin/premium/stats'),
  adminOrders: (params) => api.get('/admin/premium/orders', { params }),
  adminConfirm: (id) => api.post(`/admin/premium/orders/${id}/confirm`),
  adminReject: (id, reason) => api.post(`/admin/premium/orders/${id}/reject`, { reason }),
}

export const PREMIUM_PLAN_NAME = { venue_premium: 'Venue Premium', player_premium: 'Premium Player' }

export const PREMIUM_STATUS = {
  pending: { label: 'Chờ chuyển khoản', bg: '#FEF3C7', color: '#B45309' },
  reported: { label: 'Chờ đối chiếu', bg: '#DBEAFE', color: '#1D4ED8' },
  paid: { label: 'Đã thanh toán', bg: '#DCFCE7', color: '#15803D' },
  rejected: { label: 'Bị từ chối', bg: '#FEE2E2', color: '#B91C1C' },
  cancelled: { label: 'Đã huỷ', bg: '#F1F5F9', color: '#64748B' },
}
