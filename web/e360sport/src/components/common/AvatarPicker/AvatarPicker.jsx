import { useRef, useState } from 'react'
import { Upload, RotateCcw, Check } from 'lucide-react'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { authService } from '@/services/authService'
import { AVATAR_PRESETS, PRESET_PREFIX, MAX_AVATAR_MB } from '@/data/avatars'
import Button from '@/components/ui/Button/Button'
import { clsx, getImageUrl } from '@/utils'
import styles from './AvatarPicker.module.css'

const ACCEPT = 'image/jpeg,image/png,image/webp'

/**
 * Chọn ảnh đại diện: avatar dựng sẵn, tải ảnh riêng (≤ 2MB) hoặc về mặc định.
 * Mỗi lần chọn lưu NGAY lên máy chủ rồi cập nhật user trong context để mọi nơi
 * (thanh điều hướng, hồ sơ) đổi theo.
 */
export default function AvatarPicker() {
  const { user, updateUser } = useAuth()
  const { toast } = useToast()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const current = user?.avatar || null

  const run = async (action, okMessage) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await action()
      updateUser(res.user)
      toast.success(okMessage)
    } catch (err) {
      toast.error(err?.message || 'Không đổi được ảnh đại diện.')
    } finally {
      setBusy(false)
    }
  }

  const pickPreset = (id) => {
    const value = `${PRESET_PREFIX}${id}`
    if (value === current) return
    run(() => authService.setAvatar(value), 'Đã đổi ảnh đại diện!')
  }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // cho phép chọn lại đúng file đó lần sau
    if (!file) return
    if (!ACCEPT.split(',').includes(file.type)) { toast.error('Chỉ nhận ảnh JPG, PNG hoặc WEBP.'); return }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) { toast.error(`Ảnh quá lớn, tối đa ${MAX_AVATAR_MB}MB.`); return }
    const fd = new FormData()
    fd.append('avatar', file)
    run(() => authService.uploadAvatar(fd), 'Đã tải ảnh lên!')
  }

  const isCustom = current && !current.startsWith(PRESET_PREFIX)

  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>Ảnh đại diện</h2>
      <p className={styles.hint}>Chọn một avatar có sẵn hoặc tải ảnh của bạn lên (JPG, PNG, WEBP, tối đa {MAX_AVATAR_MB}MB).</p>

      <div className={styles.grid} role="radiogroup" aria-label="Avatar có sẵn">
        {AVATAR_PRESETS.map((a) => {
          const value = `${PRESET_PREFIX}${a.id}`
          const selected = current === value
          return (
            <button key={a.id} type="button" role="radio" aria-checked={selected} aria-label={a.label} title={a.label}
              disabled={busy} onClick={() => pickPreset(a.id)}
              className={clsx(styles.item, selected && styles.selected)}>
              <img src={getImageUrl(value)} alt="" />
              {selected && <span className={styles.check}><Check size={12} /></span>}
            </button>
          )
        })}
      </div>

      <div className={styles.actions}>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onFile} />
        <Button variant="outline" icon={<Upload size={15} />} loading={busy} onClick={() => fileRef.current?.click()}>
          {isCustom ? 'Đổi ảnh khác' : 'Tải ảnh lên'}
        </Button>
        {current && (
          <Button variant="ghost" icon={<RotateCcw size={15} />} disabled={busy}
            onClick={() => run(() => authService.setAvatar(null), 'Đã về ảnh mặc định.')}>
            Dùng ảnh mặc định
          </Button>
        )}
      </div>
    </div>
  )
}
