import { useState } from 'react'
import { User, Mail, Phone, Building2, Lock, KeyRound } from 'lucide-react'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { authService } from '@/services/authService'
import Button from '@/components/ui/Button/Button'
import Input from '@/components/ui/Input/Input'
import Avatar from '@/components/ui/Avatar/Avatar'
import AvatarPicker from '@/components/common/AvatarPicker/AvatarPicker'
import styles from './Profile.module.css'

const TABS = ['Thông tin cá nhân', 'Ảnh đại diện', 'Bảo mật']

export default function Profile() {
  const { user, updateUser } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState('Thông tin cá nhân')
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', city: user?.city || '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authService.updateProfile(form)
      updateUser(res.user)
      toast.success('Cập nhật hồ sơ thành công!')
    } catch (err) {
      toast.error(err?.message || 'Cập nhật không thành công.')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (passwords.newPassword !== passwords.confirmPassword) { toast.error('Mật khẩu xác nhận không khớp'); return }
    if (passwords.newPassword.length < 8) { toast.error('Mật khẩu mới phải có ít nhất 8 ký tự'); return }
    setLoading(true)
    try {
      await authService.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword })
      toast.success('Đổi mật khẩu thành công!')
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      toast.error(err?.message || 'Đổi mật khẩu không thành công.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.avatarSection}>
              <Avatar src={user?.avatar} name={user?.name} size="xxl" />
              <h2 className={styles.userName}>{user?.name}</h2>
              <p className={styles.userEmail}>{user?.email}</p>
            </div>
            <nav className={styles.sideNav}>
              {TABS.map(t => <button key={t} className={`${styles.sideNavItem} ${tab === t ? styles.sideNavActive : ''}`} onClick={() => setTab(t)}>{t}</button>)}
            </nav>
          </aside>
          <div className={styles.content}>
            {tab === 'Thông tin cá nhân' && (
              <form onSubmit={handleSaveProfile} className={styles.form}>
                <h2 className={styles.formTitle}>Thông tin cá nhân</h2>
                <Input label="Họ và tên" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} icon={<User size={15} />} />
                <Input label="Địa chỉ email" type="email" value={user?.email || ''} disabled icon={<Mail size={15} />} hint="Không thể thay đổi email" />
                <Input label="Số điện thoại" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} icon={<Phone size={15} />} />
                <Input label="Thành phố" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} icon={<Building2 size={15} />} />
                <Button type="submit" loading={loading}>Lưu thay đổi</Button>
              </form>
            )}
            {tab === 'Ảnh đại diện' && <AvatarPicker />}
            {tab === 'Bảo mật' && (
              <form onSubmit={handleChangePassword} className={styles.form}>
                <h2 className={styles.formTitle}>Đổi mật khẩu</h2>
                <Input label="Mật khẩu hiện tại" type="password" value={passwords.currentPassword} onChange={e => setPasswords(p => ({ ...p, currentPassword: e.target.value }))} icon={<Lock size={15} />} />
                <Input label="Mật khẩu mới" type="password" value={passwords.newPassword} onChange={e => setPasswords(p => ({ ...p, newPassword: e.target.value }))} icon={<KeyRound size={15} />} hint="Tối thiểu 8 ký tự" />
                <Input label="Xác nhận mật khẩu mới" type="password" value={passwords.confirmPassword} onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))} icon={<KeyRound size={15} />} />
                <Button type="submit" loading={loading}>Cập nhật mật khẩu</Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
