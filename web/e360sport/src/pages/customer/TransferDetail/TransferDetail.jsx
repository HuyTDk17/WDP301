import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, Clock, ShieldCheck, Copy, Check } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import { transferService, TRANSFER_STATUS, TRANSFER_TYPE_LABEL } from '@/services/transferService'
import { paymentService } from '@/services/bookingService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, formatTime } from '@/utils'
import styles from './TransferDetail.module.css'

// Các trạng thái còn đang chạy — cần hỏi lại máy chủ định kỳ.
const PENDING_STATES = ['quoted', 'awaiting_payment', 'awaiting_owner_approval', 'processing']

/**
 * Trang kết quả chuyển sân. Khi có khoản chênh lệch cần thu thêm (S > 0), đây
 * cũng là nơi khách chuyển khoản: hiển thị số tài khoản + mã QR, và trang tự
 * hỏi lại máy chủ định kỳ cho tới khi chủ sân nhận tiền xác nhận xong.
 */
export default function TransferDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    let attempts = 0

    const load = async () => {
      try {
        const res = await transferService.getById(id)
        setData(res)
        attempts += 1
        // Khi đang chờ XÁC NHẬN chuyển khoản (không chỉ chờ chuyển khoản), cho
        // phép hỏi lại lâu hơn hẳn — chủ sân đối chiếu sao kê thủ công có
        // thể mất nhiều phút, không chỉ vài giây như một cú redirect qua cổng.
        const maxAttempts = res.paymentInfo?.status === 'awaiting_confirmation' ? 200 : 40
        if (PENDING_STATES.includes(res.transfer.status) && attempts < maxAttempts) {
          timerRef.current = setTimeout(load, 3000)
        }
      } catch (err) {
        toast.error(err?.message || 'Không thể tải thông tin yêu cầu chuyển sân')
        navigate('/bookings')
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => clearTimeout(timerRef.current)
  }, [id])

  const handleCancel = async () => {
    try {
      await transferService.cancel(id)
      toast.success('Đã huỷ yêu cầu chuyển sân. Lượt đặt ban đầu vẫn còn hiệu lực.')
      const res = await transferService.getById(id)
      setData(res)
    } catch (err) {
      toast.error(err?.message || 'Không thể huỷ yêu cầu')
    }
  }

  const handleMarkTransferred = async () => {
    setMarkingPaid(true)
    try {
      await paymentService.markTransferred(data.paymentInfo.paymentId)
      toast.success('Đã ghi nhận! Chúng tôi sẽ xác nhận ngay khi kiểm tra được giao dịch.')
      const res = await transferService.getById(id)
      setData(res)
    } catch (err) {
      toast.error(err?.message || 'Không thể ghi nhận. Vui lòng thử lại.')
    } finally {
      setMarkingPaid(false)
    }
  }

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) return <div className={styles.loading}><Spinner size="lg" /></div>
  if (!data) return null

  const { transfer, breakdown } = data
  const status = TRANSFER_STATUS[transfer.status] || TRANSFER_STATUS.quoted
  const q = transfer.quote
  const isPending = PENDING_STATES.includes(transfer.status)
  const isSuccess = transfer.status === 'completed'

  return (
    <div className={styles.page}>
      <div className="container">
        <Link to="/bookings" className={styles.back}><ArrowLeft size={15} /> Quay lại lịch sử đặt sân</Link>

        <div className={styles.hero}>
          <span className={`${styles.heroIcon} ${isSuccess ? styles.ok : isPending ? styles.wait : styles.bad}`}>
            {isSuccess ? <CheckCircle2 size={28} /> : isPending ? <Clock size={28} /> : <XCircle size={28} />}
          </span>
          <div>
            <h1 className={styles.title}>
              {isSuccess ? 'Đã chuyển sân thành công'
                : transfer.status === 'awaiting_owner_approval' ? 'Đang chờ chủ sân duyệt'
                : transfer.status === 'awaiting_payment' ? 'Đang chờ thanh toán'
                : isPending ? 'Đang xử lý yêu cầu'
                : 'Yêu cầu chuyển sân không thành công'}
            </h1>
            <p className={styles.sub}>
              {TRANSFER_TYPE_LABEL[transfer.type]} · <Badge size="sm" style={{ background: status.bg, color: status.color }}>{status.label}</Badge>
            </p>
          </div>
        </div>

        {(transfer.rejectionReason || transfer.failureReason) && (
          <div className={styles.reasonBox}>
            <p><strong>Lý do:</strong> {transfer.rejectionReason || transfer.failureReason}</p>
            <p className={styles.reassure}>
              <ShieldCheck size={14} /> Lượt đặt ban đầu của bạn tại &ldquo;{transfer.fromVenueName}&rdquo; vẫn còn nguyên hiệu lực.
              Mọi khoản đã thu thêm đang được hoàn lại.
            </p>
          </div>
        )}

        <div className={styles.card}>
          <div className={styles.routeBox}>
            <div>
              <span className={styles.routeTag}>Từ</span>
              <p className={styles.routeVenue}>{transfer.fromVenueName}</p>
              <p className={styles.routeCourt}>{transfer.fromCourtName}</p>
              <p className={styles.routeTime}>{formatDate(transfer.fromDate)} · {formatTime(transfer.fromStartTime)}–{formatTime(transfer.fromEndTime)}</p>
            </div>
            <ArrowRight size={20} className={styles.routeArrow} />
            <div>
              <span className={`${styles.routeTag} ${styles.routeTagTo}`}>Đến</span>
              <p className={styles.routeVenue}>{transfer.toVenueName}</p>
              <p className={styles.routeCourt}>{transfer.toCourtName}</p>
              <p className={styles.routeTime}>{formatDate(transfer.toDate)} · {formatTime(transfer.toStartTime)}–{formatTime(transfer.toEndTime)}</p>
            </div>
          </div>

          <h2 className={styles.sectionTitle}>Chi tiết chi phí</h2>
          <div className={styles.breakdown}>
            {(breakdown || []).map((row, i) => (
              <div key={i} className={`${styles.breakRow} ${row.emphasis ? styles.breakRowTotal : ''}`}>
                <span>{row.label}</span>
                <strong className={row.amount < 0 ? styles.negative : ''}>
                  {row.amount < 0 ? `− ${formatCurrency(-row.amount)}` : formatCurrency(row.amount)}
                </strong>
              </div>
            ))}
          </div>

          {q?.refundCredit > 0 && isSuccess && (
            <p className={styles.note}>
              {formatCurrency(q.refundCredit)} đã được cộng vào số dư khuyến mãi của tài khoản, dùng để trừ cho các lần đặt sân sau.
            </p>
          )}

          {transfer.status === 'awaiting_payment' && data.paymentInfo?.bankTransfer?.configured && (
            <div className={styles.bankBox}>
              <h2 className={styles.sectionTitle}>Chuyển khoản để hoàn tất</h2>
              <div className={styles.bankLayout}>
                {data.paymentInfo.bankTransfer.qrUrl && (
                  <img src={data.paymentInfo.bankTransfer.qrUrl} alt="Mã QR chuyển khoản" className={styles.bankQrImg} />
                )}
                <div className={styles.bankInfo}>
                  <BankRow label="Ngân hàng" value={data.paymentInfo.bankTransfer.bankName} />
                  <BankRow label="Số tài khoản" value={data.paymentInfo.bankTransfer.accountNumber} copyable onCopy={handleCopy} copied={copied} />
                  <BankRow label="Chủ tài khoản" value={data.paymentInfo.bankTransfer.accountName} />
                  <BankRow label="Số tiền" value={formatCurrency(data.paymentInfo.bankTransfer.amount)} highlight />
                  <BankRow label="Nội dung" value={data.paymentInfo.bankTransfer.content} copyable onCopy={handleCopy} copied={copied} highlight />
                </div>
              </div>
              {data.paymentInfo.status === 'awaiting_confirmation' ? (
                <p className={styles.confirmHint}>
                  Đã ghi nhận — đang chờ xác nhận. Trang này sẽ tự cập nhật khi giao dịch được xác nhận.
                </p>
              ) : (
                <Button fullWidth onClick={handleMarkTransferred} loading={markingPaid}>
                  Tôi đã chuyển khoản
                </Button>
              )}
            </div>
          )}

          <div className={styles.actions}>
            {isPending && transfer.status !== 'processing' && data.paymentInfo?.status !== 'awaiting_confirmation' && (
              <Button variant="outline" onClick={handleCancel}>Huỷ yêu cầu</Button>
            )}
            <Button onClick={() => navigate('/bookings')}>Về lịch sử đặt sân</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BankRow({ label, value, copyable, onCopy, copied, highlight }) {
  return (
    <div className={styles.bankRow}>
      <span className={styles.bankRowLabel}>{label}</span>
      <div className={styles.bankRowValueWrap}>
        <span className={`${styles.bankRowValue} ${highlight ? styles.bankRowValueHighlight : ''}`}>{value}</span>
        {copyable && (
          <button type="button" className={styles.copyBtn} onClick={() => onCopy(value)} aria-label={`Sao chép ${label}`}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}
