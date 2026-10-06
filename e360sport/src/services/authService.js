import api from './api'

// ============================================================
// authService — gọi thẳng API thật.
//
// Yêu cầu backend (đã có sẵn, xem backend/routes/authRoutes.js):
//   POST /auth/register          { name, email, password, phone, role } -> { token, user }
//   POST /auth/login             { email, password }                    -> { token, user }
//   POST /auth/google            { credential }  (ID token từ Google)    -> { token, user, isNewUser }
//   GET  /auth/me                (Bearer token)                          -> { user }
//   POST /auth/owner-application FormData (Bearer token)                  -> { user }
//   POST /auth/forgot-password   { email }                               -> { message }
//   POST /auth/reset-password/:token { password }                        -> { message }
//   POST /auth/verify-email/:token (không cần đăng nhập)                 -> { message, user }
//   POST /auth/resend-verification (Bearer token)                        -> { message }
//   PUT  /auth/profile           { ...fields }                           -> { user }
//   PUT  /auth/change-password   { currentPassword, newPassword }        -> { message }
//   POST /auth/avatar            FormData (field 'avatar', ảnh ≤ 2MB)     -> { avatarUrl, user }
//   PUT  /auth/avatar            { avatar: 'preset:avatar-03' | null }    -> { user }
// ============================================================

export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  googleAuth: (credential) => api.post('/auth/google', { credential }),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
  submitOwnerApplication: (formData) => api.post('/auth/owner-application', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  verifyEmail: (token) => api.post(`/auth/verify-email/${token}`),
  resendVerification: () => api.post('/auth/resend-verification'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  // Chọn avatar dựng sẵn ('preset:avatar-03') hoặc null để về ảnh mặc định
  setAvatar: (avatar) => api.put('/auth/avatar', { avatar }),
  uploadAvatar: (formData) => api.post('/auth/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}
