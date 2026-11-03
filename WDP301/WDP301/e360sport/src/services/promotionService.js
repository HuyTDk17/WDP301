import api from './api'

export const promotionService = {
  // Admin
  getPromotionsAdmin: () => api.get('/admin/promotions'),
  createPromotion: (data) => api.post('/admin/promotions', data),
  updatePromotion: (id, data) => api.put(`/admin/promotions/${id}`, data),
  togglePromotionStatus: (id) => api.patch(`/admin/promotions/${id}/status`),
  deletePromotion: (id) => api.delete(`/admin/promotions/${id}`),

  // Khách hàng — kiểm tra mã lúc thanh toán
  validatePromoCode: (data) => api.post('/bookings/validate-promo', data),
}
