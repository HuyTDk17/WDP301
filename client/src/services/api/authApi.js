import axiosClient from '../axiosClient.js';

// [DOC] POST /auth/register chỉ có trong SDS 1.2. Các endpoint còn lại là GIẢ ĐỊNH (xem API_CONTRACT.md).
export const authApi = {
  register: ({ fullName, email, password, confirmPassword }) =>
    axiosClient.post('/auth/register', { fullName, email, password, confirmPassword }),
  verifyEmail: (token) => axiosClient.post('/auth/verify-email', { token }),
  login: ({ email, password }) => axiosClient.post('/auth/login', { email, password }),
  forgotPassword: (email) => axiosClient.post('/auth/forgot-password', { email }),
  resetPassword: ({ token, newPassword, confirmPassword }) =>
    axiosClient.post('/auth/reset-password', { token, newPassword, confirmPassword }),
  changePassword: ({ currentPassword, newPassword }) =>
    axiosClient.put('/auth/change-password', { currentPassword, newPassword }),
};
