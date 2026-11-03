import api from './api'

// ============================================================
// contentService — banner, tin tức, trang chính sách, danh mục môn.
//
// Công khai (không cần đăng nhập):
//   GET /banners · /news?page&limit · /news/:slug · /policies · /policies/:key · /sports
// Quản trị (Admin):
//   /admin/banners        GET · POST,PUT (multipart: image) · DELETE
//   /admin/news           GET ?status&search&page · GET /:id · POST,PUT (multipart: coverImage) · DELETE
//   /admin/policies       GET · POST,PUT {key,title,intro,sections[],isPublished} · DELETE
//   /admin/sport-categories  GET · POST,PUT {key,name,icon,color,order,isActive} · DELETE
// ============================================================

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const contentService = {
  // ── công khai ──
  getBanners: () => api.get('/banners'),
  getNews: (params = {}) => api.get('/news', { params }),
  getNewsBySlug: (slug) => api.get(`/news/${slug}`),
  getPolicy: (key) => api.get(`/policies/${key}`),

  // ── Admin: banner ──
  adminGetBanners: () => api.get('/admin/banners'),
  adminCreateBanner: (formData) => api.post('/admin/banners', formData, multipart),
  adminUpdateBanner: (id, formData) => api.put(`/admin/banners/${id}`, formData, multipart),
  adminDeleteBanner: (id) => api.delete(`/admin/banners/${id}`),

  // ── Admin: tin tức ──
  adminGetNews: (params = {}) => api.get('/admin/news', { params }),
  adminGetNewsById: (id) => api.get(`/admin/news/${id}`),
  adminCreateNews: (formData) => api.post('/admin/news', formData, multipart),
  adminUpdateNews: (id, formData) => api.put(`/admin/news/${id}`, formData, multipart),
  adminDeleteNews: (id) => api.delete(`/admin/news/${id}`),

  // ── Admin: chính sách ──
  adminGetPolicies: () => api.get('/admin/policies'),
  adminCreatePolicy: (data) => api.post('/admin/policies', data),
  adminUpdatePolicy: (id, data) => api.put(`/admin/policies/${id}`, data),
  adminDeletePolicy: (id) => api.delete(`/admin/policies/${id}`),

  // ── Admin: danh mục môn ──
  adminGetSports: () => api.get('/admin/sport-categories'),
  adminCreateSport: (data) => api.post('/admin/sport-categories', data),
  adminUpdateSport: (id, data) => api.put(`/admin/sport-categories/${id}`, data),
  adminDeleteSport: (id) => api.delete(`/admin/sport-categories/${id}`),
}
