import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import styles from './Modal.module.css'
import { clsx } from '@/utils'

export default function Modal({ isOpen, onClose, title, children, size = 'md', footer, className }) {
  const overlayRef = useRef()

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!isOpen) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={(e) => { if (e.target === overlayRef.current) onClose?.() }}>
      <div className={clsx(styles.modal, styles[size], className)}>
        {title && (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button className={styles.close} onClick={onClose} aria-label="Đóng"><X size={18} /></button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}
