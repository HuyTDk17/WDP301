import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import styles from './ConfirmModal.module.css'

export default function ConfirmModal({ isOpen, onClose, onConfirm, title = 'Xác nhận hành động', message, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', variant = 'danger', loading = false, icon }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" footer={
      <>
        <Button variant="outline" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
        <Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>
    }>
      <div className={styles.body}>
        {icon && <div className={styles.icon}>{icon}</div>}
        <p className={styles.message}>{message}</p>
      </div>
    </Modal>
  )
}
