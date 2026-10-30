import api from './api'

// ============================================================
// settingsService — Cài đặt nền tảng (tên, email hỗ trợ, % hoa hồng)
// getPublicSettings(): không cần đăng nhập, chỉ trả field không nhạy cảm —
// dùng để trang đặt sân hiển thị đúng % phí dịch vụ khi xem trước giá.
// getPlatformSettings()/updatePlatformSettings(): chỉ admin, xem backend/
// controllers/settingsController.js
// ============================================================
export const settingsService = {
  getPublicSettings: () => api.get('/settings/public'),
  getPublicStats: () => api.get('/stats/public'),
  getPlatformSettings: () => api.get('/admin/settings'),
  updatePlatformSettings: (data) => api.put('/admin/settings', data),
}
