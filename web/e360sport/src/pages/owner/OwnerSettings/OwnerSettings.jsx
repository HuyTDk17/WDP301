import { useState, useEffect } from 'react'
import { Building2, Lock, Wallet, User, Mail, Phone, FileText, KeyRound, Landmark, CreditCard } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Button from '@/components/ui/Button/Button'
import Input from '@/components/ui/Input/Input'
import Spinner from '@/components/ui/Spinner/Spinner'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/authState'
import { authService } from '@/services/authService'
import { VN_BANKS, findBankByBin } from '@/data/vnBanks'
import styles from './OwnerSettings.module.css'

const TABS = [
  { id: 'profile', label: 'Hồ sơ doanh nghiệp', Icon: Building2 },
  { id: 'security', label: 'Bảo mật', Icon: Lock },
  { id: 'payout', label: 'Thông tin nhận tiền', Icon: Wallet },
]

export default function OwnerSettings() {
  const { toast } = useToast()
  const { user, updateUser } = useAuth()
  const [tab, setTab] = useState('profile')
  const [loading, setLoading] = useState(false)

  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', businessName: user?.businessName || '', taxId: user?.taxId || '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [payout, setPayout] = useState({
    bankName: user?.bankName || '', bankBin: user?.bankBin || '',
    bankAccount: user?.bankAccount || '', bankAccountName: user?.bankAccountName || '',
  })
  // Ngân hàng có trong danh sách → chọn từ dropdown (tự điền tên + BIN).
  // Không có (hoặc đã lưu một BIN lạ) → chế độ "Ngân hàng khác", nhập tay.
  const [otherBank, setOtherBank] = useState(!!user?.bankBin && !findBankByBin(user.bankBin))
  const bankSelectValue = otherBank ? 'other' : (payout.bankBin || '')

  const handleBankSelect = (value) => {
    if (value === 'other') {
      setOtherBank(true)
      setPayout(p => ({ ...p, bankName: '', bankBin: '' }))
      return
    }
    setOtherBank(false)
    const bank = findBankByBin(value)
    setPayout(p => ({ ...p, bankBin: bank?.bin || '', bankName: bank?.name || '' }))
  }

  const payoutReady = !!(payout.bankBin && payout.bankAccount && payout.bankAccountName)

  const handleSaveProfile = async () => {
    setLoading(true)
    try {
      const res = await authService.updateProfile(profile)
      updateUser(res.user)
      toast.success('Đã lưu thông tin hồ sơ!')
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu thông tin')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) { toast.error('Mật khẩu xác nhận không khớp'); return }
    if (passwords.newPassword.length < 8) { toast.error('Mật khẩu mới phải có ít nhất 8 ký tự'); return }
    setLoading(true)
    try {
      await authService.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword })
      toast.success('Đổi mật khẩu thành công!')
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      toast.error(err?.message || 'Đổi mật khẩu không thành công')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePayout = async () => {
    setLoading(true)
    try {
      const res = await authService.updateProfile(payout)
      updateUser(res.user)
      toast.success('Đã lưu thông tin nhận tiền!')
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu thông tin')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Cài đặt" subtitle="Quản lý hồ sơ doanh nghiệp và tùy chọn của bạn" />
      <div className={styles.layout}>
        <div className={styles.tabsCard}>{TABS.map(t => <button key={t.id} className={`${styles.tabBtn} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}><span><t.Icon size={16} /></span>{t.label}</button>)}</div>
        <div className={styles.contentCard}>
          {tab === 'profile' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Hồ sơ doanh nghiệp</h3>
              <div className={styles.formGrid}>
                <Input label="Họ và tên" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} icon={<User size={15} />} />
                <Input label="Tên doanh nghiệp" value={profile.businessName} onChange={e => setProfile(p => ({ ...p, businessName: e.target.value }))} icon={<Building2 size={15} />} />
                <Input label="Email" value={profile.email} disabled icon={<Mail size={15} />} hint="Không thể thay đổi email" />
                <Input label="Điện thoại" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} icon={<Phone size={15} />} />
                <Input label="Mã số thuế / Giấy phép KD" value={profile.taxId} onChange={e => setProfile(p => ({ ...p, taxId: e.target.value }))} icon={<FileText size={15} />} />
              </div>
              <div className={styles.actions}><Button loading={loading} onClick={handleSaveProfile}>Lưu thay đổi</Button></div>
            </div>
          )}
          {tab === 'security' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Đổi mật khẩu</h3>
              <div className={styles.formList}>
                <Input label="Mật khẩu hiện tại" type="password" value={passwords.currentPassword} onChange={e => setPasswords(p => ({ ...p, currentPassword: e.target.value }))} icon={<Lock size={15} />} />
                <Input label="Mật khẩu mới" type="password" value={passwords.newPassword} onChange={e => setPasswords(p => ({ ...p, newPassword: e.target.value }))} icon={<KeyRound size={15} />} hint="Tối thiểu 8 ký tự" />
                <Input label="Xác nhận mật khẩu mới" type="password" value={passwords.confirmPassword} onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))} icon={<KeyRound size={15} />} />
              </div>
              <div className={styles.actions}><Button loading={loading} onClick={handleChangePassword}>Cập nhật mật khẩu</Button></div>
            </div>
          )}
          {tab === 'payout' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Tài khoản nhận thanh toán đặt sân</h3>
              <p className={styles.sectionSub}>
                Khách đặt sân của bạn sẽ chuyển khoản <strong>trực tiếp vào tài khoản này</strong> (kèm mã QR VietQR).
                Bạn là người đối chiếu sao kê và xác nhận đã nhận tiền ở mục <strong>Xác nhận chuyển khoản</strong>.
              </p>
              {!payoutReady && (
                <p className={styles.warnNote}>
                  Chưa đủ thông tin — khách sẽ <strong>chưa thể thanh toán</strong> cho sân của bạn cho tới khi bạn điền đủ ngân hàng, số tài khoản và tên chủ tài khoản.
                </p>
              )}
              <div className={styles.formGrid}>
                <div className={styles.selectField}>
                  <label htmlFor="owner-bank-select">Ngân hàng</label>
                  <select id="owner-bank-select" value={bankSelectValue} onChange={e => handleBankSelect(e.target.value)}>
                    <option value="">— Chọn ngân hàng —</option>
                    {VN_BANKS.map(b => <option key={b.bin} value={b.bin}>{b.name}</option>)}
                    <option value="other">Ngân hàng khác (nhập mã BIN)</option>
                  </select>
                </div>
                <Input label="Số tài khoản" value={payout.bankAccount} onChange={e => setPayout(p => ({ ...p, bankAccount: e.target.value }))} icon={<CreditCard size={15} />} hint="Chỉ gồm chữ số, không có khoảng trắng." />
                {otherBank && <>
                  <Input label="Tên ngân hàng" value={payout.bankName} onChange={e => setPayout(p => ({ ...p, bankName: e.target.value }))} icon={<Landmark size={15} />} />
                  <Input label="Mã BIN ngân hàng" value={payout.bankBin} onChange={e => setPayout(p => ({ ...p, bankBin: e.target.value }))} icon={<CreditCard size={15} />} hint="Tra tại https://api.vietqr.io/v2/banks (3–6 chữ số)." />
                </>}
                <Input label="Tên chủ tài khoản" value={payout.bankAccountName} onChange={e => setPayout(p => ({ ...p, bankAccountName: e.target.value.toUpperCase() }))} icon={<User size={15} />} placeholder="NGUYEN VAN A" hint="Viết không dấu, đúng như trên tài khoản ngân hàng." />
              </div>
              <div className={styles.actions}><Button loading={loading} onClick={handleSavePayout}>Lưu thông tin nhận tiền</Button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
