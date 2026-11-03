import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import styles from './HoldTimer.module.css'

/**
 * Đếm ngược thời gian giữ chỗ tạm còn lại. Khi hết giờ, gọi onExpire()
 * để frontend xử lý (thường là hủy hold + báo khách chọn lại khung giờ).
 *
 * @param {string|Date} expiresAt - thời điểm hold hết hạn (ISO string từ backend)
 * @param {() => void} onExpire - callback khi đếm ngược về 0
 */
export default function HoldTimer({ expiresAt, onExpire }) {
  const [secondsLeft, setSecondsLeft] = useState(() => getSecondsLeft(expiresAt))

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire?.()
      return
    }
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(interval)
          onExpire?.()
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const isUrgent = secondsLeft <= 60

  return (
    <div className={`${styles.timer} ${isUrgent ? styles.urgent : ''}`}>
      <span className={styles.icon}><Clock size={16} strokeWidth={2.25} /></span>
      <span className={styles.text}>
        Giữ chỗ còn <strong>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</strong> — vui lòng hoàn tất thanh toán trước khi hết giờ
      </span>
    </div>
  )
}

function getSecondsLeft(expiresAt) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.floor(diff / 1000))
}
