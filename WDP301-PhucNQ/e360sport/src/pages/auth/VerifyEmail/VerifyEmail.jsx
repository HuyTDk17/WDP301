import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authService } from '@/services/authService'
import { useAuth } from '@/contexts/authState'
import Button from '@/components/ui/Button/Button'
import styles from '../ResetPassword/ResetPassword.module.css'

/**
 * Trang xác minh email — điểm đến của liên kết trong email đăng ký.
 *
 * KHÔNG bọc trong GuestRoute: đăng ký xong người dùng đã được đăng nhập ngay
 * (xem authController.register trả về token), nên khi họ bấm link xác minh
 * trong email thì rất có thể đang ĐÃ đăng nhập — GuestRoute sẽ đá họ ra khỏi
 * trang trước khi kịp gọi API xác minh. Trang này chạy được ở cả hai trạng
 * thái đăng nhập hay chưa.
 */
export default function VerifyEmail() {
  const { token } = useParams()
  const { user, updateUser } = useAuth()
  const [status, setStatus] = useState('verifying') // verifying | success | error
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    authService.verifyEmail(token)
      .then((res) => {
        if (cancelled) return
        setStatus('success')
        // Nếu đang đăng nhập đúng tài khoản vừa xác minh, cập nhật luôn state
        // để giao diện (banner nhắc xác minh...) biến mất ngay, không cần tải lại trang.
        if (user && res?.user && res.user._id === user._id) {
          updateUser(res.user)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setStatus('error')
        setMessage(err?.message || 'Liên kết không hợp lệ hoặc đã hết hạn')
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (status === 'verifying') {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}>⏳</span>
        <h2 className={styles.title}>Đang xác minh email...</h2>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}>✅</span>
        <h2 className={styles.title}>Xác minh email thành công</h2>
        <p className={styles.desc}>Email của bạn đã được xác minh. Giờ bạn có thể đăng ký làm chủ sân nếu muốn.</p>
        <Link to={user ? '/' : '/login'}><Button size="lg">{user ? 'Về trang chủ' : 'Đến trang đăng nhập'}</Button></Link>
      </div>
    )
  }

  return (
    <div className={styles.success}>
      <span className={styles.successIcon}>⚠️</span>
      <h2 className={styles.title}>Không xác minh được</h2>
      <p className={styles.desc}>{message}</p>
      <Link to={user ? '/profile' : '/login'} className={styles.backLink}>
        {user ? 'Vào trang cá nhân để gửi lại email xác minh' : '← Quay lại đăng nhập'}
      </Link>
    </div>
  )
}
