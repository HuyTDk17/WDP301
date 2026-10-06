import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '@/services/authService'
import { useToast } from '@/contexts/ToastContext'
import Input from '@/components/ui/Input/Input'
import Button from '@/components/ui/Button/Button'
import styles from './ForgotPassword.module.css'

export default function ForgotPassword() {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) { setError('Vui lòng nhập email'); return }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Địa chỉ email không hợp lệ'); return }
    setLoading(true)
    try {
      await authService.forgotPassword(email)
      setSent(true)
      toast.success('Đã gửi liên kết đặt lại mật khẩu! Vui lòng kiểm tra hộp thư.')
    } catch (err) {
      toast.error(err?.message || 'Đã có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}>📬</span>
        <h2 className={styles.title}>Kiểm tra email của bạn</h2>
        <p className={styles.desc}>Chúng tôi đã gửi liên kết đặt lại mật khẩu đến <strong>{email}</strong>. Vui lòng kiểm tra hộp thư và làm theo hướng dẫn.</p>
        <Link to="/login" className={styles.backLink}>← Quay lại đăng nhập</Link>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.iconWrap}><span className={styles.icon}>🔑</span></div>
      <div className={styles.header}>
        <h1 className={styles.title}>Quên mật khẩu?</h1>
        <p className={styles.sub}>Không sao cả — nhập email của bạn và chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>
      </div>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <Input label="Địa chỉ email" type="email" placeholder="ban@example.com" value={email} onChange={e => { setEmail(e.target.value); setError('') }} error={error} icon="✉️" required />
        <Button type="submit" fullWidth size="lg" loading={loading}>Gửi liên kết đặt lại</Button>
      </form>
      <Link to="/login" className={styles.backLink}>← Quay lại đăng nhập</Link>
    </div>
  )
}
