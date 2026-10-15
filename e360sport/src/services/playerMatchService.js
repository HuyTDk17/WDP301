import api from './api'

export const playerMatchService = {
  list: (params = {}) => api.get('/matches', { params }),
  create: (data) => api.post('/matches', data),
  join: (id) => api.post(`/matches/${id}/join`),
}