import api from './api'

// ============================================================
// notificationService, favoriteService, statsService, userService
// Gọi API thật — xem backend/routes/notificationRoutes.js, favoriteRoutes.js,
// ownerRoutes.js, adminRoutes.js
// ============================================================

// Tên sự kiện trình duyệt báo "thông báo vừa đổi (đã đọc/xóa)". Chuông ở Navbar/OwnerLayout/AdminLayout nằm ngoài
// trang Thông báo nên không biết gì về thao tác ở đây — nó lắng nghe sự kiện này để tải lại số chưa đọc ngay,
// thay vì chờ chu kỳ poll 25 giây (trước đây số trên chuông đứng yên dù thông báo đã đọc).
export const NOTIFICATIONS_CHANGED_EVENT = 'notifications:changed'
const notifyChanged = (result) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
  return result
}

export const notificationService = {
  getNotifications: () => api.get('/notifications'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`).then(notifyChanged),
  markAllAsRead: () => api.patch('/notifications/read-all').then(notifyChanged),
  deleteNotification: (id) => api.delete(`/notifications/${id}`).then(notifyChanged),
  getUnreadCount: () => api.get('/notifications/unread-count'),
}

export const favoriteService = {
  getFavorites: () => api.get('/favorites'),
  addFavorite: (venueId) => api.post('/favorites', { venueId }),
  removeFavorite: (venueId) => api.delete(`/favorites/${venueId}`),
}

export const statsService = {
  getOwnerStats: () => api.get('/owner/stats'),
  getOwnerRevenue: (params = {}) => api.get('/owner/revenue', { params }),
  getAdminStats: () => api.get('/admin/stats'),
  getAdminRevenue: (params = {}) => api.get('/admin/revenue', { params }),
  getUserStats: () => api.get('/admin/users/stats'),
}

export const userService = {
  getUsers: (params = {}) => api.get('/admin/users', { params }),
  getUserById: (id) => api.get(`/admin/users/${id}`),
  updateUserStatus: (id, status, reason = '') => api.patch(`/admin/users/${id}/status`, { status, reason }),
  changeRole: (id, role, reason) => api.patch(`/admin/users/${id}/role`, { role, reason }),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getOwners: () => api.get('/admin/owners'),
  getOwnerDetail: (id) => api.get(`/admin/owners/${id}`),
  confirmBankInfo: (id) => api.patch(`/admin/owners/${id}/confirm-bank-info`),
}

// Mở một giấy tờ pháp lý của hồ sơ chủ sân (route có xác thực, xem
// backend/controllers/documentController.js). Không dùng được thẻ <a href>
// thường vì trình duyệt không tự đính kèm header Authorization khi điều
// hướng — phải tự fetch kèm token rồi mở bằng object URL tạm.
export const openOwnerDocument = async (url) => {
  const blob = await api.get(url, { responseType: 'blob' })
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, '_blank', 'noopener,noreferrer')
  // Trì hoãn thu hồi để tab mới (PDF/ảnh) có đủ thời gian tải xong nội dung.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}
