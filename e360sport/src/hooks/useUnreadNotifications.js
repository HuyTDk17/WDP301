import { useState, useEffect, useCallback, useRef } from 'react'
import { notificationService } from '@/services/notificationService'

/**
 * Giữ số thông báo chưa đọc luôn cập nhật mà không tốn nhiều tài nguyên:
 *
 *  - KHÔNG dùng WebSocket/SSE — app đặt sân không cần độ trễ theo mili-giây,
 *    và việc giữ hàng trăm kết nối mở tốn RAM + phức tạp hạ tầng hơn nhiều
 *    so với lợi ích thực tế mang lại.
 *  - Poll một API rất nhẹ (chỉ trả về 1 con số: /notifications/unread-count),
 *    KHÔNG poll toàn bộ danh sách thông báo.
 *  - Tự dừng poll khi tab bị ẩn (document.hidden) — người dùng chuyển tab
 *    khác thì không tốn request nào cả.
 *  - Gọi lại ngay khi tab được focus/hiện lại, để số liệu không bị "đứng"
 *    quá lâu sau khi người dùng quay lại.
 *
 * @param {boolean} enabled - chỉ poll khi đã đăng nhập
 * @param {number} intervalMs - chu kỳ poll khi tab đang mở (mặc định 25s)
 */
export function useUnreadNotifications(enabled, intervalMs = 25000) {
  const [count, setCount] = useState(0)
  const mountedRef = useRef(true)

  const fetchCount = useCallback(() => {
    if (!enabled) return
    notificationService.getUnreadCount()
      .then((res) => { if (mountedRef.current) setCount(res.count || 0) })
      .catch(() => {})
  }, [enabled])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!enabled) { setCount(0); return }

    fetchCount()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchCount()
    }, intervalMs)

    const onVisibilityChange = () => { if (document.visibilityState === 'visible') fetchCount() }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, intervalMs, fetchCount])

  return { unreadCount: count, refetchUnreadCount: fetchCount }
}
