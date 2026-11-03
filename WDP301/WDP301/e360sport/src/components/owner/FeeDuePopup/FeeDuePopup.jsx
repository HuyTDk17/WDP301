import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldAlert, Clock } from 'lucide-react'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import { settlementService } from '@/services/settlementService'
import { formatCurrency, toLocalISODate } from '@/utils'
import styles from './FeeDuePopup.module.css'

const POLL_MS = 60 * 1000

const readDismissed = (key) => { try { return localStorage.getItem(key) === '1' } catch { return false } }
const writeDismissed = (key) => { try { localStorage.setItem(key, '1') } catch { /* chế độ riêng tư: bỏ qua */ } }

/**
 * Popup nhắc chủ sân nộp PHÍ DỊCH VỤ nền tảng.
 *
 * Hoá đơn được lập tự động vào ngày 1 hằng tháng (backend/services/settlementService.js). Khi chủ
 * sân vào khu quản lý mà còn hoá đơn chưa thanh toán, popup hiện ra với số tiền, mã QR và nút dẫn
 * tới trang thanh toán; bấm "Để sau" thì hôm nay không hiện lại (mai hiện lại nếu vẫn chưa nộp).
 *
 * Popup TỰ TẮT khi hoá đơn hết ở trạng thái chờ thanh toán: nó hỏi lại máy chủ mỗi phút, và khi
 * hệ thống tự xác nhận đã nhận tiền (webhook ngân hàng) thì hoá đơn chuyển sang "đã thanh toán".
 */
export default function FeeDuePopup() {
  const navigate = useNavigate()
  const location = useLocation()
  const [data, setData] = useState(null)
  const [dismissedKey, setDismissedKey] = useState('')

  const load = useCallback(() => {
    settlementService.getMyCommission().then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const open = data?.open
  const due = open && open.direction === 'owner_pays' && open.status === 'issued' && open.payInfo ? open : null
  const key = due ? `feePopup:${due.code}:${toLocalISODate()}` : ''
  const onPayPage = location.pathname.startsWith('/owner/commission')
  const visible = !!due && !onPayPage && dismissedKey !== key && !readDismissed(key)

  const close = () => { if (key) { writeDismissed(key); setDismissedKey(key) } }
  const goPay = () => { close(); navigate('/owner/commission') }

  if (!visible) return null

  const dueDate = new Date(due.dueDate).toLocaleDateString('vi-VN')
  const lockDate = due.lockDate ? new Date(due.lockDate).toLocaleDateString('vi-VN') : null
  const lockDays = data.policy?.lockDays

  return (
    <Modal
      isOpen
      onClose={close}
      title="Phí dịch vụ cần thanh toán"
      size="md"
      footer={(
        <>
          <Button variant="outline" onClick={close}>Để sau</Button>
          <Button onClick={goPay}>Xem chi tiết &amp; thanh toán</Button>
        </>
      )}
    >
      <div className={styles.wrap}>
        <p className={styles.amountLabel}>Số tiền cần nộp cho nền tảng</p>
        <p className={styles.amount}>{formatCurrency(due.amount)}</p>

        <img className={styles.qr} src={due.payInfo.qrUrl} alt="Mã QR chuyển khoản phí dịch vụ" />
        <p className={styles.transferNote}>
          Quét mã bằng app ngân hàng — số tiền và nội dung <strong>{due.code}</strong> đã được điền sẵn.
        </p>

        <div className={`${styles.notice} ${data.blocked ? styles.noticeDanger : styles.noticeWarn}`}>
          {data.blocked ? <ShieldAlert size={16} /> : <Clock size={16} />}
          <span>
            {data.blocked
              ? <>Địa điểm của bạn đang bị <strong>khoá</strong> (không hiển thị, không nhận đặt mới) vì phí dịch vụ quá hạn. Thanh toán để mở lại ngay.</>
              : <>Hạn thanh toán: <strong>{dueDate}</strong>{lockDays ? ` (${lockDays} ngày kể từ khi lập hoá đơn)` : ''}.
                {lockDate && <> Sau <strong>{lockDate}</strong> mà chưa thanh toán, địa điểm của bạn sẽ bị khoá và không còn hiển thị trên hệ thống.</>}</>}
          </span>
        </div>

        {data.policy?.autoConfirm && (
          <p className={styles.autoNote}>Thông báo này sẽ tự tắt khi hệ thống nhận được khoản chuyển của bạn.</p>
        )}
      </div>
    </Modal>
  )
}
