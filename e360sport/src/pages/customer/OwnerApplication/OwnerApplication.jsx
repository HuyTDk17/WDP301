import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Input from '@/components/ui/Input/Input'
import Button from '@/components/ui/Button/Button'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { authService } from '@/services/authService'
import { openOwnerDocument } from '@/services/notificationService'
import styles from './OwnerApplication.module.css'

export default function OwnerApplication() {
  const navigate = useNavigate()
  const { user, submitOwnerApplication } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [errors, setErrors] = useState({})
  const [files, setFiles] = useState([])
  const [form, setForm] = useState({
    businessName: user?.businessName || '',
    taxId: user?.taxId || '',
    businessAddress: user?.businessAddress || '',
    businessPhone: user?.businessPhone || user?.phone || '',
    legalRepresentative: user?.legalRepresentative || user?.name || '',
    licenseNumber: user?.licenseNumber || '',
    ownerApplicationNote: user?.ownerApplicationNote || '',
  })

  const set = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const next = {}
    if (!form.businessName.trim()) next.businessName = 'Vui lòng nhập tên doanh nghiệp/hộ kinh doanh'
    if (!form.taxId.trim()) next.taxId = 'Vui lòng nhập mã số thuế hoặc mã giấy phép'
    if (!form.businessAddress.trim()) next.businessAddress = 'Vui lòng nhập địa chỉ kinh doanh'
    if (!form.legalRepresentative.trim()) next.legalRepresentative = 'Vui lòng nhập người đại diện'
    if (!form.licenseNumber.trim()) next.licenseNumber = 'Vui lòng nhập số giấy phép kinh doanh'
    if (files.length === 0 && (!user?.ownerApplicationDocuments || user.ownerApplicationDocuments.length === 0)) {
      next.documents = 'Vui lòng tải lên ít nhất một giấy tờ pháp lý'
    }
    return next
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // TRƯỚC ĐÂY: không xác minh email người nộp hồ sơ — chặn ngay ở đây, khớp
    // với backend (authController.submitOwnerApplication trả 403 EMAIL_NOT_VERIFIED
    // nếu lỡ có ai bỏ qua được bước này, vd. gọi thẳng API).
    if (!user?.emailVerified) {
      toast.error('Vui lòng xác minh email trước khi gửi hồ sơ')
      return
    }
    const nextErrors = validate()
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }

    const formData = new FormData()
    Object.entries(form).forEach(([key, value]) => formData.append(key, value))
    files.forEach(file => formData.append('documents', file))

    setLoading(true)
    try {
      await submitOwnerApplication(formData)
      toast.success('Đã gửi hồ sơ đăng ký chủ sân. Quản trị viên sẽ xét duyệt sớm.')
      navigate('/notifications')
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi hồ sơ. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const status = user?.ownerApplicationStatus

  const handleResendVerification = async () => {
    setResending(true)
    try {
      const res = await authService.resendVerification()
      toast.success(res?.message || 'Đã gửi lại email xác minh')
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi lại email xác minh')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.shell}>
          <div className={styles.header}>
            <p className={styles.kicker}>Hồ sơ chủ sân</p>
            <h1 className={styles.title}>Đăng ký kinh doanh sân thể thao</h1>
            <p className={styles.sub}>Điền thông tin pháp lý để quản trị viên xác minh trước khi cấp quyền đăng địa điểm.</p>
          </div>

          {!user?.emailVerified && (
            <div className={styles.noticeDanger}>
              Bạn cần xác minh email ({user?.email}) trước khi gửi hồ sơ đăng ký chủ sân.
              Kiểm tra hộp thư (kể cả thư rác), hoặc{' '}
              <button type="button" className={styles.inlineLink} disabled={resending} onClick={handleResendVerification}>
                {resending ? 'Đang gửi...' : 'gửi lại email xác minh'}
              </button>.
            </div>
          )}

          {status === 'pending' && (
            <div className={styles.notice}>Hồ sơ của bạn đang chờ xét duyệt. Bạn có thể gửi lại nếu cần cập nhật thông tin.</div>
          )}
          {status === 'rejected' && user?.ownerApplicationRejectionReason && (
            <div className={styles.noticeDanger}>Lý do từ chối: {user.ownerApplicationRejectionReason}</div>
          )}
          {status === 'approved' && (
            <div className={styles.noticeSuccess}>Hồ sơ đã được duyệt. <Link to="/owner/dashboard">Vào trang quản lý chủ sân</Link></div>
          )}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.grid}>
              <Input label="Tên doanh nghiệp / hộ kinh doanh" value={form.businessName} onChange={set('businessName')} error={errors.businessName} required />
              <Input label="Mã số thuế / mã định danh" value={form.taxId} onChange={set('taxId')} error={errors.taxId} required />
              <Input label="Người đại diện pháp luật" value={form.legalRepresentative} onChange={set('legalRepresentative')} error={errors.legalRepresentative} required />
              <Input label="Số giấy phép kinh doanh" value={form.licenseNumber} onChange={set('licenseNumber')} error={errors.licenseNumber} required />
              <Input label="Số điện thoại kinh doanh" value={form.businessPhone} onChange={set('businessPhone')} />
              <Input label="Địa chỉ kinh doanh" value={form.businessAddress} onChange={set('businessAddress')} error={errors.businessAddress} required />
            </div>

            <label className={styles.field}>
              <span>Ghi chú bổ sung</span>
              <textarea value={form.ownerApplicationNote} onChange={set('ownerApplicationNote')} rows={4} placeholder="Ví dụ: loại hình kinh doanh, số lượng sân dự kiến, khu vực hoạt động..." />
            </label>

            <label className={styles.fileField}>
              <span>Giấy tờ pháp lý</span>
              <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => { setFiles(Array.from(e.target.files || [])); setErrors(prev => ({ ...prev, documents: '' })) }} />
              <small>Chấp nhận JPG, PNG, WEBP hoặc PDF. Có thể tải lên giấy phép kinh doanh, mã số thuế, giấy tờ đại diện.</small>
              {errors.documents && <p className={styles.error}>{errors.documents}</p>}
            </label>

            {user?.ownerApplicationDocuments?.length > 0 && (
              <div className={styles.docs}>
                <span>Giấy tờ đã gửi</span>
                {user.ownerApplicationDocuments.map((doc) => (
                  <button key={doc.url} type="button" className={styles.docLink}
                    onClick={() => openOwnerDocument(doc.url).catch((err) => toast.error(err?.message || 'Không thể mở tài liệu'))}>
                    {doc.name || doc.url}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.actions}>
              <Button type="submit" loading={loading} disabled={!user?.emailVerified}
                title={user?.emailVerified ? '' : 'Cần xác minh email trước khi gửi hồ sơ'}>
                {status === 'pending' ? 'Cập nhật hồ sơ' : 'Gửi hồ sơ xét duyệt'}
              </Button>
              <Link to="/" className={styles.backLink}>Quay lại trang chủ</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
