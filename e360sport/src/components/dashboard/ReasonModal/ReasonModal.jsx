import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import styles from './ReasonModal.module.css'

// Modal dùng chung cho MỌI hành động kiểm duyệt của admin cần ghi lý do và
// thông báo cho người liên quan (khóa user, tạm ngưng/xóa venue, xóa review...).
// Dùng lại ở nhiều trang thay vì viết riêng từng nơi.
export default function ReasonModal({ isOpen, onClose, onConfirm, title, description, icon, variant = 'danger', confirmLabel, reasonRequired = true, reasonPlaceholder, reasonLabel = 'Lý do' }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { if (isOpen) setReason('') }, [isOpen])

  const handleConfirm = async () => {
    if (reasonRequired && !reason.trim()) return
    setSubmitting(true)
    try { await onConfirm(reason.trim()) } finally { setSubmitting(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" footer={
      <>
        <Button variant="outline" onClick={onClose} disabled={submitting}>Hủy</Button>
        <Button variant={variant} onClick={handleConfirm} loading={submitting} disabled={reasonRequired && !reason.trim()}>{confirmLabel}</Button>
      </>
    }>
      <div className={styles.body}>
        {icon && <div className={styles.icon}>{icon}</div>}
        <p className={styles.desc}>{description}</p>
        <label className={styles.label}>
          {reasonLabel} {reasonRequired ? <span className={styles.required}>*</span> : <span className={styles.optional}>(không bắt buộc)</span>}
        </label>
        <textarea
          className={styles.input}
          rows={3}
          placeholder={reasonPlaceholder}
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <p className={styles.hint}>Nội dung này sẽ được gửi kèm trong thông báo.</p>
      </div>
    </Modal>
  )
}
