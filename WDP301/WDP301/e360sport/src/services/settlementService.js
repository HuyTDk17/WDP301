import api from './api'

// ============================================================
// settlementService — ĐỐI SOÁT PHÍ DỊCH VỤ (hoa hồng) giữa nền tảng và chủ sân.
//
// Khách chuyển tiền đặt sân THẲNG cho chủ sân nên nền tảng không có tiền để tự khấu
// trừ hoa hồng. Hệ thống tính số dư của từng chủ sân, lập hoá đơn đối soát; chủ sân
// nộp phần nợ (chuyển khoản + bấm "Đã chuyển"), quản trị viên đối chiếu và xác nhận.
// ============================================================

export const settlementService = {
  // ── Chủ sân ──
  getMyCommission: () => api.get('/owner/commission'),
  getFeeOrders: (month) => api.get('/owner/commission/orders', { params: month ? { month } : {} }),
  reportPaid: (id, note) => api.post(`/owner/commission/${id}/report`, { note }),
  getOwnerRefunds: () => api.get('/owner/refunds'),
  ownerMarkRefunded: (paymentId) => api.patch(`/owner/refunds/${paymentId}/refunded`),

  // ── Quản trị viên ──
  list: (status) => api.get('/admin/settlements', { params: status ? { status } : {} }),
  getBalances: () => api.get('/admin/settlements/balances'),
  getOwnerSettlements: (ownerId) => api.get(`/admin/owners/${ownerId}/settlements`),
  issueForOwner: (ownerId) => api.post(`/admin/owners/${ownerId}/settlements`),
  confirm: (id) => api.post(`/admin/settlements/${id}/confirm`),
  reject: (id, reason) => api.post(`/admin/settlements/${id}/reject`, { reason }),
  cancel: (id) => api.post(`/admin/settlements/${id}/cancel`),
}

export const SETTLEMENT_STATUS = {
  issued: { label: 'Chờ thanh toán', bg: '#FEF3C7', color: '#B45309' },
  reported: { label: 'Đã báo chuyển — chờ đối chiếu', bg: '#DBEAFE', color: '#1D4ED8' },
  paid: { label: 'Đã thanh toán', bg: '#DCFCE7', color: '#15803D' },
  cancelled: { label: 'Đã huỷ', bg: '#F1F5F9', color: '#64748B' },
}
