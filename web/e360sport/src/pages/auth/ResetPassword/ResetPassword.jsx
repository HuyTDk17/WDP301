import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { authService } from '@/services/authService'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import Input from '@/components/ui/Input/Input'
import Button from '@/components/ui/Button/Button'
import styles from './ResetPassword.module.css'

/**
 * Trang đặt mật khẩu mới từ liên kết trong email.
 *
 * Trang này trước đây không tồn tại: backend có sẵn route
 * POST /auth/reset-password/:token nhưng luôn trả 503 vì chưa có dịch vụ email,
 * nên không ai làm giao diện cho nó. Sau khi cấu hình SMTP, đây là điểm đến của
 * liên kết trong email.
 *
 * Backend trả về { token, user } khi đặt lại thành công, nên người dùng vào
 * thẳng ứng dụng mà không phải đăng nhập lại lần nữa.
 */
export default function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { applySession } = useAuth()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const validate = () => {
    const next = {}
    if (!password) next.password = 'Vui lòng nhập mật khẩu mới'
    else if (password.length < 8) next.password = 'Mật khẩu phải có ít nhất 8 ký tự'
    if (confirm !== password) next.confirm = 'Mật khẩu nhập lại không khớp'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const res = await authService.resetPassword(token, password)
      setDone(true)
      toast.success('Đã đặt lại mật khẩu thành công!')

      // Nếu AuthProvider có sẵn hàm nhận phiên đăng nhập mới thì dùng luôn;
      // không thì đưa người dùng về trang đăng nhập.
      if (typeof applySession === 'function' && res?.token) {
        applySession(res.token, res.user)
        setTimeout(() => navigate('/'), 800)
      } else {
        setTimeout(() => navigate('/login'), 1200)
      }
    } catch (err) {
      // Mã hết hạn hoặc đã dùng rồi — nói rõ để người dùng biết phải yêu cầu lại
      // thay vì thử đi thử lại cùng một liên kết.
      toast.error(err?.message || 'Liên kết không hợp lệ hoặc đã hết hạn')
      setErrors({ password: err?.message || 'Liên kết không hợp lệ hoặc đã hết hạn' })
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}>✅</span>
        <h2 className={styles.title}>Đã đổi mật khẩu</h2>
        <p className={styles.desc}>Mật khẩu mới của bạn đã có hiệu lực. Đang đưa bạn vào ứng dụng...</p>
        <Link to="/login" className={styles.backLink}>Đến trang đăng nhập</Link>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.iconWrap}><span className={styles.icon}>🔒</span></div>
      <div className={styles.header}>
        <h1 className={styles.title}>Đặt mật khẩu mới</h1>
        <p className={styles.sub}>Chọn một mật khẩu mới cho tài khoản của bạn. Liên kết này chỉ dùng được một lần.</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <Input
          label="Mật khẩu mới"
          type="password"
          placeholder="Ít nhất 8 ký tự"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrors({}) }}
          error={errors.password}
          icon="🔑"
          required
        />
        <Input
          label="Nhập lại mật khẩu mới"
          type="password"
          placeholder="Nhập lại để xác nhận"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setErrors({}) }}
          error={errors.confirm}
          icon="🔑"
          required
        />
        <Button type="submit" fullWidth size="lg" loading={loading}>Đặt lại mật khẩu</Button>
      </form>

      <Link to="/login" className={styles.backLink}>← Quay lại đăng nhập</Link>
    </div>
  )
}
