import axiosClient from '../axiosClient.js';

// FR 1.7 / 1.8
export const notificationApi = {
  list: (params) => axiosClient.get('/notifications', { params }),
  markRead: (id) => axiosClient.patch(`/notifications/${id}/read`),
  markAllRead: () => axiosClient.patch('/notifications/read-all'),
};
