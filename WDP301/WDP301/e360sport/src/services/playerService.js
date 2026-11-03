import api from './api'

// ============================================================
// playerService — tìm người chơi chung (chỉ khách hàng).
//
//   GET  /players?sport&venueId&date&level&page&limit   danh sách bài còn chỗ (không có SĐT)
//   POST /players                { bookingId, slotsNeeded, level, note }
//   GET  /players/mine           bài của tôi + các yêu cầu (SĐT chỉ có ở yêu cầu đã chấp nhận)
//   POST /players/:id/close      chủ nhóm đóng bài
//   POST /players/:id/join       { message }
//   GET  /players/requests/mine  yêu cầu của tôi (liên lạc chủ nhóm chỉ có khi đã được nhận)
//   POST /players/requests/:id/respond   { decision: 'accept'|'reject' }
//   POST /players/requests/:id/withdraw
// `contact` = { name, phone, zaloUrl } — chỉ xuất hiện SAU KHI hai bên được ghép nhóm.
// ============================================================

export const LEVELS = [
  { value: 'any', label: 'Mọi trình độ' },
  { value: 'beginner', label: 'Mới chơi' },
  { value: 'intermediate', label: 'Trung bình' },
  { value: 'advanced', label: 'Giỏi' },
]
export const levelLabel = (v) => LEVELS.find((l) => l.value === v)?.label || 'Mọi trình độ'

export const playerService = {
  getPosts: (params = {}) => api.get('/players', { params }),
  createPost: (data) => api.post('/players', data),
  getMyPosts: () => api.get('/players/mine'),
  closePost: (id) => api.post(`/players/${id}/close`),
  joinPost: (id, message = '') => api.post(`/players/${id}/join`, { message }),
  getMyRequests: () => api.get('/players/requests/mine'),
  respond: (requestId, decision) => api.post(`/players/requests/${requestId}/respond`, { decision }),
  withdraw: (requestId) => api.post(`/players/requests/${requestId}/withdraw`),
}
