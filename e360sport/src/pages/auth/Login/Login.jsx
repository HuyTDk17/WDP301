import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import Input from '@/components/ui/Input/Input'
import Button from '@/components/ui/Button/Button'
import GoogleSignInButton from '@/components/common/GoogleSignInButton/GoogleSignInButton'
import styles from './Login.module.css'

export default function Login() {
  const { login, loginWithGoogle } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const goAfterAuth = (user) => {
    if (user.role === 'owner') navigate('/owner/dashboard')
    else if (user.role === 'admin') navigate('/admin/dashboard')
    else navigate('/')
  }

  const handleGoogleCredential = async (credential) => {
    setGoogleLoading(true)
    try {
      const { user, isNewUser } = await loginWithGoogle(credential)
      toast.success(isNewUser ? `Chào mừng đến với ESport360, ${user.name.split(' ')[0]}!` : `Chào mừng trở lại, ${user.name.split(' ')[0]}!`)
      goAfterAuth(user)
    } catch (err) {
      toast.error(err?.message || 'Không thể đăng nhập bằng Google. Vui lòng thử lại.')
    } finally {
      setGoogleLoading(false)
    }
  }

  const validate = () => {
    const e = {}
    if (!form.email) e.email = 'Vui lòng nhập email'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Địa chỉ email không hợp lệ'
    if (!form.password) e.password = 'Vui lòng nhập mật khẩu'
    else if (form.password.length < 6) e.password = 'Mật khẩu phải có ít nhất 6 ký tự'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      const user = await login(form)
      toast.success(`Chào mừng trở lại, ${user.name.split(' ')[0]}!`)
      goAfterAuth(user)
    } catch (err) {
      toast.error(err?.message || 'Thông tin đăng nhập không đúng. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const set = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>Chào mừng trở lại</h1>
        <p className={styles.sub}>Đăng nhập vào tài khoản ESport360 của bạn</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <Input label="Địa chỉ email" type="email" value={form.email} onChange={set('email')} error={errors.email} icon="✉️" required autoComplete="email" />
        <Input label="Mật khẩu" type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')} error={errors.password} icon="🔒"
          iconRight={<button type="button" className={styles.eyeBtn} onClick={() => setShowPass(v => !v)}>{showPass ? '🙈' : '👁️'}</button>}
          required autoComplete="current-password" />
        <div className={styles.meta}>
          <label className={styles.remember}><input type="checkbox" className={styles.checkbox} /><span>Ghi nhớ đăng nhập</span></label>
          <Link to="/forgot-password" className={styles.forgotLink}>Quên mật khẩu?</Link>
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading}>Đăng nhập</Button>
      </form>

      <GoogleSignInButton onCredential={handleGoogleCredential} disabled={googleLoading} />

      <p className={styles.footer}>Chưa có tài khoản? <Link to="/register" className={styles.link}>Đăng ký miễn phí</Link></p>
    </div>
  )
}
