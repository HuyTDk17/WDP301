import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import styles from './Toast.module.css'

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()
  return (
    <div className={styles.container}>
      {toasts.map(toast => {
        const Icon = ICONS[toast.type] || Info
        return (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
            <span className={styles.icon}><Icon size={18} /></span>
            <p className={styles.message}>{toast.message}</p>
            <button className={styles.close} onClick={() => removeToast(toast.id)}><X size={14} /></button>
          </div>
        )
      })}
    </div>
  )
}
