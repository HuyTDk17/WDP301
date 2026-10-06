import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import Input from '@/components/ui/Input/Input'
import Button from '@/components/ui/Button/Button'
import GoogleSignInButton from '@/components/common/GoogleSignInButton/GoogleSignInButton'
import styles from './Register.module.css'

export default function Register() {
  const { register, loginWithGoogle } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialRole = searchParams.get('role') === 'owner' ? 'owner' : 'customer'
  const isOwnerRegistration = initialRole === 'owner'
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '', role: initialRole, agreeTerms: false })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const goAfterAuth = (user, isNewUser) => {
    if (isOwnerRegistration && isNewUser) navigate('/owner-application')
    else if (user.role === 'owner') navigate('/owner/dashboard')
    else navigate('/')
  }

  const handleGoogleCredential = async (credential) => {
    setGoogleLoading(true)
    try {
      const { user, isNewUser } = await loginWithGoogle(credential)
      if (isNewUser) {
        toast.success('Tạo tài khoản thành công! Chào mừng bạn đến với ESport360 🎉')
        // TRƯỚC ĐÂY (đăng ký bằng mật khẩu): luôn bắt buộc nhập số điện thoại.
        // Google không cung cấp số điện thoại — nhắc bổ sung sau thay vì chặn hẳn
        // luồng đăng ký, để không mất đi chính lợi ích của "đăng ký nhanh bằng Google".
        if (!user.phone) {
          setTimeout(() => toast.info('Hãy bổ sung số điện thoại trong trang Cá nhân để chủ sân tiện liên hệ khi cần.'), 600)
        }
      } else {
        toast.success(`Chào mừng trở lại, ${user.name.split(' ')[0]}!`)
      }
      goAfterAuth(user, isNewUser)
    } catch (err) {
      toast.error(err?.message || 'Không thể đăng ký bằng Google. Vui lòng thử lại.')
    } finally {
      setGoogleLoading(false)
    }
  }

  useEffect(() => {
    setForm(prev => ({ ...prev, role: initialRole }))
  }, [initialRole])

  const validate = () => {
    const e = {}
    const phoneDigits = form.phone.replace(/\D/g, '')
    if (!form.name.trim()) e.name = 'Vui lòng nhập họ tên'
    if (!form.email) e.email = 'Vui lòng nhập email'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email không hợp lệ'
    if (!form.phone) e.phone = 'Vui lòng nhập số điện thoại'
    else if (phoneDigits.length !== 10) e.phone = 'Số điện thoại phải gồm đúng 10 chữ số'
    if (!form.password) e.password = 'Vui lòng nhập mật khẩu'
    else if (form.password.length < 8) e.password = 'Tối thiểu 8 ký tự'
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Mật khẩu xác nhận không khớp'
    if (!form.agreeTerms) e.agreeTerms = 'Bạn cần đồng ý với điều khoản sử dụng'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      const user = await register({ ...form, phone: form.phone.replace(/\D/g, '') })
      toast.success('Tạo tài khoản thành công! Chào mừng bạn đến với ESport360 🎉')
      goAfterAuth(user, true)
    } catch (err) {
      toast.error(err?.message || 'Đăng ký không thành công. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(prev => ({ ...prev, [field]: val }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const pwStrength = form.password.length === 0 ? 0 : form.password.length < 6 ? 1 : form.password.length < 10 ? 2 : /[A-Z]/.test(form.password) && /[0-9]/.test(form.password) ? 4 : 3

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>{isOwnerRegistration ? 'Đăng ký tài khoản chủ sân' : 'Tạo tài khoản của bạn'}</h1>
        <p className={styles.sub}>{isOwnerRegistration ? 'Quản lý địa điểm và nhận lịch đặt sân trên ESport360' : 'Đặt sân thể thao nhanh chóng trên ESport360'}</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <Input label="Họ và tên" value={form.name} onChange={set('name')} error={errors.name} icon="👤" required autoComplete="name" />
        <Input label="Địa chỉ email" type="email" value={form.email} onChange={set('email')} error={errors.email} icon="✉️" required autoComplete="email" />
        <Input label="Số điện thoại" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} icon="📱" required autoComplete="tel" inputMode="numeric" maxLength={12} />
        <div>
          <Input label="Mật khẩu" type={showPass ? 'text' : 'password'} hint="Tối thiểu 8 ký tự" value={form.password} onChange={set('password')} error={errors.password} icon="🔒"
            iconRight={<button type="button" className={styles.eyeBtn} onClick={() => setShowPass(v => !v)}>{showPass ? '🙈' : '👁️'}</button>}
            required autoComplete="new-password" />
          {form.password && (
            <div className={styles.pwStrength}>
              <div className={styles.pwBars}>{[1, 2, 3, 4].map(i => <div key={i} className={`${styles.pwBar} ${pwStrength >= i ? styles[`str${pwStrength}`] : ''}`} />)}</div>
              <span className={styles.pwLabel}>{['', 'Yếu', 'Tạm ổn', 'Khá tốt', 'Mạnh'][pwStrength]}</span>
            </div>
          )}
        </div>
        <Input label="Xác nhận mật khẩu" type={showPass ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} icon="🔒" required autoComplete="new-password" />
        <div className={styles.terms}>
          <label className={styles.termsLabel}>
            <input type="checkbox" checked={form.agreeTerms} onChange={set('agreeTerms')} className={styles.checkbox} />
            <span>Tôi đồng ý với <Link to="/terms-of-service" target="_blank" className={styles.link}>Điều khoản dịch vụ</Link> và <Link to="/privacy-policy" target="_blank" className={styles.link}>Chính sách bảo mật</Link></span>
          </label>
          {errors.agreeTerms && <p className={styles.termsError}>{errors.agreeTerms}</p>}
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading}>Tạo tài khoản</Button>
      </form>

      <GoogleSignInButton onCredential={handleGoogleCredential} disabled={googleLoading} />

      <p className={styles.footer}>Đã có tài khoản? <Link to="/login" className={styles.link}>Đăng nhập</Link></p>
    </div>
  )
}
