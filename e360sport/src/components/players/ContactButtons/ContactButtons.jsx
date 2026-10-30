import { Phone, MessageCircle, Copy } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import styles from './ContactButtons.module.css'

/**
 * Liên lạc với người đã được ghép nhóm: số điện thoại + nút Gọi + nút nhắn Zalo (https://zalo.me/<số>).
 * Chỉ được render khi máy chủ đã trả `contact` (tức hai bên đã được ghép).
 */
export default function ContactButtons({ contact }) {
  const { toast } = useToast()
  if (!contact?.phone) return <p className={styles.missing}>Người này chưa có số điện thoại.</p>

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contact.phone)
      toast.success('Đã sao chép số điện thoại')
    } catch {
      toast.error('Không sao chép được, bạn hãy chọn và sao chép thủ công')
    }
  }

  return (
    <div className={styles.box}>
      <div className={styles.phone}>
        <Phone size={14} />
        <strong>{contact.phone}</strong>
        <button type="button" className={styles.copy} onClick={copy} aria-label="Sao chép số điện thoại"><Copy size={13} /></button>
      </div>
      <div className={styles.actions}>
        <a className={styles.call} href={`tel:${contact.phone}`}><Phone size={14} /> Gọi</a>
        {contact.zaloUrl && (
          <a className={styles.zalo} href={contact.zaloUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={14} /> Nhắn Zalo
          </a>
        )}
      </div>
    </div>
  )
}
