import { useState, useEffect, useCallback } from 'react'
import { authService } from '@/services/authService'
import { AuthContext } from '@/contexts/authState'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState(() => localStorage.getItem('sv_token'))

  useEffect(() => {
    if (token) {
      authService.getMe()
        .then(data => setUser(data.user))
        .catch(() => { setToken(null); localStorage.removeItem('sv_token') })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = useCallback(async (credentials) => {
    const data = await authService.login(credentials)
    localStorage.setItem('sv_token', data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  // Đăng nhập VÀ đăng ký bằng Google trong một: chưa có tài khoản thì backend tự
  // tạo. Trả về { user, isNewUser } (khác login/register chỉ trả user) để giao diện
  // biết mà chào mừng người mới và nhắc bổ sung số điện thoại.
  const loginWithGoogle = useCallback(async (credential) => {
    const data = await authService.googleAuth(credential)
    localStorage.setItem('sv_token', data.token)
    setToken(data.token)
    setUser(data.user)
    return { user: data.user, isNewUser: !!data.isNewUser }
  }, [])

  const register = useCallback(async (userData) => {
    const data = await authService.register(userData)
    localStorage.setItem('sv_token', data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const submitOwnerApplication = useCallback(async (formData) => {
    const data = await authService.submitOwnerApplication(formData)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('sv_token')
    setToken(null)
    setUser(null)
  }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => ({ ...prev, ...updates }))
  }, [])

  // Làm mới thông tin user (đặc biệt là "role") từ server. Cần dùng trước khi
  // điều hướng tới 1 route yêu cầu role cụ thể (vd: từ thông báo "hồ sơ chủ sân
  // đã được duyệt" -> /owner/dashboard), vì role của user có thể vừa được admin
  // đổi ở một phiên khác trong khi user vẫn đang đăng nhập với token/role cũ.
  const refreshUser = useCallback(async () => {
    try {
      const data = await authService.getMe()
      setUser(data.user)
      return data.user
    } catch {
      return null
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithGoogle, register, submitOwnerApplication, logout, updateUser, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}
