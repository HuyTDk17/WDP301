import { useState } from 'react'
import { Copy, Check, Clock, Gift, X } from 'lucide-react'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { transferService } from '@/services/transferService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, formatTime } from '@/utils'
import styles from './AssignBookingModal.module.css'

/**
 * Sang tên lượt đặt cho người khác (loại T5).
 *
 * Giữ nguyên sân, ngày và giờ — chỉ đổi người đứng tên. Người chuyển tạo một
 * mã, gửi cho bạn bè; người nhận nhập mã vào trang Nhận suất. Tiền sân hai bên
 * tự thoả thuận với nhau, nền tảng không giữ hộ và không can thiệp.
 */
export default function AssignBookingModal({ booking, isOpen, onClose, onDone }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    try {
      const res = await transferService.createAssignment(booking._id)
      setResult(res)
      if (res.reused) toast.info?.('Lượt đặt này đã có mã còn hiệu lực')
    } catch (err) {
      toast.error(err?.message || 'Không thể tạo mã sang tên')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Trình duyệt không cho phép sao chép, vui lòng chép tay mã này')
    }
  }

  const handleCancel = async () => {
    try {
      await transferService.cancelAssignment(result.transfer._id)
      toast.success('Đã huỷ mã sang tên. Suất vẫn thuộc về bạn.')
      setResult(null)
      onDone?.()
      onClose()
    } catch (err) {
      toast.error(err?.message || 'Không thể huỷ mã')
    }
  }

  const close = () => { setResult(null); onClose() }

  return (
    <Modal isOpen={isOpen} onClose={close} title="Sang tên cho người khác" size="sm">
      <div className={styles.body}>
        <div className={styles.bookingBox}>
          <p className={styles.venue}>{booking?.venueName} – {booking?.courtName}</p>
          <p className={styles.time}>
            {booking && `${formatDate(booking.date)} · ${formatTime(booking.startTime)}–${formatTime(booking.endTime)}`}
          </p>
        </div>

        {!result ? (
          <>
            <p className={styles.desc}>
              Không đi được nhưng có bạn bè nhận lại suất? Tạo một mã và gửi cho họ. Sân, ngày và giờ giữ
              nguyên, chỉ đổi người đứng tên. Tiền sân hai bạn tự thanh toán với nhau — nền tảng không giữ hộ.
            </p>
            <div className={styles.feeNote}>
              <Gift size={15} />
              <p>Người nhận suất sẽ trả một khoản phí sang tên nhỏ, chuyển thẳng cho chủ sân. Bạn không mất thêm gì.</p>
            </div>
            <Button fullWidth loading={loading} onClick={handleCreate}>Tạo mã sang tên</Button>
          </>
        ) : (
          <>
            <p className={styles.desc}>Gửi mã này cho người nhận suất. Họ vào mục <strong>Nhận suất đặt sân</strong> và nhập mã.</p>

            <button className={styles.codeBox} onClick={handleCopy}>
              <span className={styles.code}>{result.code}</span>
              <span className={styles.copyIcon}>{copied ? <Check size={16} /> : <Copy size={16} />}</span>
            </button>
            {copied && <p className={styles.copiedMsg}>Đã sao chép mã</p>}

            <div className={styles.metaRow}>
              <span><Clock size={13} /> Hết hạn lúc {new Date(result.expiresAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
              {result.fee > 0 && <span><Gift size={13} /> Phí người nhận trả: {formatCurrency(result.fee)}</span>}
            </div>

            <p className={styles.warn}>
              Suất vẫn thuộc về bạn cho tới khi có người nhập mã thành công. Nếu đổi ý, hãy huỷ mã bên dưới.
            </p>

            <div className={styles.actions}>
              <Button variant="outline" icon={<X size={14} />} onClick={handleCancel}>Huỷ mã</Button>
              <Button onClick={close}>Xong</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
