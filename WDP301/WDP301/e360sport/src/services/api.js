import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:9999/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('sv_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('sv_token')
      window.location.href = '/login'
    }
    let data = error.response?.data
    // Khi request dùng responseType:'blob' (vd. tải/xem tài liệu), axios cũng ép
    // phần thân LỖI thành Blob thay vì JSON đã parse sẵn — phải tự đọc lại nội
    // dung thật ở đây, nếu không nơi gọi luôn nhận message rỗng dù server có trả
    // lý do rõ ràng (vd. "Không tìm thấy tài liệu").
    if (data instanceof Blob && data.type?.includes('json')) {
      try { data = JSON.parse(await data.text()) } catch { data = null }
    }
    // Kèm theo mã HTTP để nơi gọi phân biệt được loại lỗi (VD: 409 khung giờ
    // vừa bị đặt mất, 410 báo giá hết hạn) chứ không chỉ có mỗi câu thông báo.
    return Promise.reject({
      ...(data || { message: 'Lỗi kết nối mạng' }),
      status: error.response?.status,
    })
  }
)

export default api
