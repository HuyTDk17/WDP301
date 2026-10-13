import api from './api'

// ============================================================
// eventService — sự kiện (giải đấu / khuyến mãi) của chủ sân.
//
// Công khai:  GET /events?venueId&type&page&limit · GET /events/:id
// Chủ sân:    GET /owner/events?phase=upcoming|ongoing|ended|cancelled
//             POST /owner/events · PUT /owner/events/:id   (multipart: image, removeImage)
//             POST /owner/events/:id/cancel  { reason }
// phase (suy ra theo giờ hiện tại): upcoming | ongoing | ended | cancelled
// ============================================================

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const EVENT_TYPES = [
  { value: 'tournament', label: 'Giải đấu' },
  { value: 'promotion', label: 'Khuyến mãi' },
  { value: 'other', label: 'Sự kiện khác' },
]
export const eventTypeLabel = (v) => EVENT_TYPES.find((t) => t.value === v)?.label || 'Sự kiện'

export const eventService = {
  // ── công khai ──
  getEvents: (params = {}) => api.get('/events', { params }),
  getEventById: (id) => api.get(`/events/${id}`),

  // ── chủ sân ──
  getOwnerEvents: (params = {}) => api.get('/owner/events', { params }),
  createEvent: (formData) => api.post('/owner/events', formData, multipart),
  updateEvent: (id, formData) => api.put(`/owner/events/${id}`, formData, multipart),
  cancelEvent: (id, reason) => api.post(`/owner/events/${id}/cancel`, { reason }),
}
