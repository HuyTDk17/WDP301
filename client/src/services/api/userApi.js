import axiosClient from '../axiosClient.js';

// FR 1.4 / 1.5 — email và role không được sửa ở màn hình này.
export const userApi = {
  getProfile: () => axiosClient.get('/users/me'),
  updateProfile: ({ fullName, phone, avatarUrl }) =>
    axiosClient.put('/users/me', { fullName, phone, avatarUrl }),
};
