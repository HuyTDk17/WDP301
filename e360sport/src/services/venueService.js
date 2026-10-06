import api from './api'

// ============================================================
// venueService — gọi API thật cho toàn bộ nghiệp vụ địa điểm/sân.
//
// Backend cần implement (xem backend/routes/venueRoutes.js + ownerRoutes.js):
//   GET    /venues                ?sport&city&district&search&minPrice&maxPrice&minRating&page&limit
//   GET    /venues/featured
//   GET    /venues/:id
//   GET    /venues/:id/courts                          -> danh sách sân con của 1 địa điểm
//   GET    /venues/:id/slots?courtId=&date=             -> khung giờ trống/đã đặt trong ngày
//   GET    /venues/:id/reviews
//   POST   /venues/:id/reviews     (auth: customer)
//   GET    /owner/venues           (auth: owner)
//   POST   /owner/venues           (auth: owner, multipart — field 'images')
//   PUT    /owner/venues/:id       (auth: owner, multipart)
//   DELETE /owner/venues/:id       (auth: owner)
//   PATCH  /owner/venues/:id/status (auth: owner)
//   GET    /owner/courts                                (auth: owner)
//   POST   /owner/venues/:venueId/courts                (auth: owner)
//   PUT    /owner/venues/:venueId/courts/:courtId        (auth: owner)
//   PATCH  /owner/venues/:venueId/courts/:courtId/status (auth: owner)
//   DELETE /owner/venues/:venueId/courts/:courtId        (auth: owner)
// Lưu ý: địa điểm được duyệt tự động khi tạo (chủ sân đã được admin xét duyệt
// từ bước đăng ký làm chủ sân), admin không có bước duyệt TRƯỚC khi đăng.
// Thay vào đó, admin có quyền kiểm duyệt SAU khi đăng (xóa / tạm ngưng bất kỳ
// địa điểm nào) qua GET/DELETE/PATCH /admin/venues — xem adminRoutes.js.
// ============================================================

export const venueService = {
  // ── Công khai ──
  getVenues: (params = {}) => api.get('/venues', { params }),
  getVenueById: (id) => api.get(`/venues/${id}`),
  getFeaturedVenues: () => api.get('/venues/featured'),
  getVenueCourts: (venueId) => api.get(`/venues/${venueId}/courts`),

  /**
   * Lấy bản đồ khung giờ của 1 sân trong 1 ngày cụ thể.
   * Trả về: { openTime, closeTime, slotDuration, bookedSlots: [{start,end,status}] }
   * Frontend tự sinh các khung giờ cố định (VD 06:00-07:00, 07:00-08:00...)
   * dựa trên openTime/closeTime/slotDuration, rồi đối chiếu với bookedSlots.
   */
  getCourtSlots: (venueId, courtId, date) =>
    api.get(`/venues/${venueId}/slots`, { params: { courtId, date } }),

  getVenueReviews: (venueId, params = {}) => api.get(`/venues/${venueId}/reviews`, { params }),
  addReview: (venueId, data) => api.post(`/venues/${venueId}/reviews`, data),

  // ── Chủ sân ──
  getOwnerVenues: () => api.get('/owner/venues'),
  createVenue: (formData) =>
    api.post('/owner/venues', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateVenue: (id, formData) =>
    api.put(`/owner/venues/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteVenue: (id) => api.delete(`/owner/venues/${id}`),
  toggleVenueStatus: (id) => api.patch(`/owner/venues/${id}/status`),

  getOwnerCourts: () => api.get('/owner/courts'),
  createCourt: (venueId, data) => api.post(`/owner/venues/${venueId}/courts`, data),
  updateCourt: (venueId, courtId, data) => api.put(`/owner/venues/${venueId}/courts/${courtId}`, data),
  updateCourtStatus: (venueId, courtId, status) =>
    api.patch(`/owner/venues/${venueId}/courts/${courtId}/status`, { status }),
  deleteCourt: (venueId, courtId) => api.delete(`/owner/venues/${venueId}/courts/${courtId}`),

  // ── Admin (quản lý toàn bộ địa điểm trên nền tảng) ──
  getAllVenuesAdmin: (params = {}) => api.get('/admin/venues', { params }),
  getVenueStatsAdmin: () => api.get('/admin/venues/stats'),
  adminDeleteVenue: (id, reason) => api.delete(`/admin/venues/${id}`, { data: { reason } }),
  adminToggleVenueStatus: (id, reason) => api.patch(`/admin/venues/${id}/status`, { reason }),
  warnVenueOwner: (id, reason) => api.post(`/admin/venues/${id}/warn`, { reason }),

  // ── Admin (kiểm duyệt đánh giá) ──
  getAllReviewsAdmin: (params = {}) => api.get('/admin/reviews', { params }),
  adminDeleteReview: (id, reason) => api.delete(`/admin/reviews/${id}`, { data: { reason } }),
}
