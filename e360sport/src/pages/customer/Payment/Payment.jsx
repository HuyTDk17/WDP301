import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PartyPopper, Frown, Lock, Trophy, Calendar, Clock, LandPlot, BadgeDollarSign, Gift, Copy, Check, Landmark, Hourglass } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/authState'
import { useBooking } from '@/contexts/BookingContext'
import { paymentService, bookingService } from '@/services/bookingService'
import { venueService } from '@/services/venueService'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { formatCurrency, formatDate, formatTime, getImageUrl } from '@/utils'
import styles from './Payment.module.css'

// Sau khi khách bấm "Tôi đã chuyển khoản", tự động kiểm tra lại trạng thái đơn
// mỗi khoảng thời gian này — để họ thấy đơn được xác nhận ngay khi chủ sân
// xác nhận xong, không cần tự bấm F5.
const POLL_INTERVAL_MS = 5000

export default function Payment() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { user, refreshUser } = useAuth()
  const { booking, reset } = useBooking()
  // Đơn được nối lại từ trang Lịch sử đặt sân (/payment?bookingId=...): sau khi
  // tải lại trang hoặc đăng nhập lại, BookingContext đã trống nên phải dựng
  // thông tin hiển thị từ chính đơn lấy về từ máy chủ.
  const returningId = searchParams.get('bookingId')
  const [resumedBooking, setResumedBooking] = useState(null)
  const [resumedVenueImage, setResumedVenueImage] = useState('')
  const useResumed = !!(returningId && resumedBooking)
  const createdBooking = useResumed ? resumedBooking : booking.booking
  const venue = useResumed ? { name: resumedBooking.venueName, images: resumedVenueImage ? [resumedVenueImage] : [] } : booking.venue
  const court = useResumed ? { name: resumedBooking.courtName } : booking.court
  const date = useResumed ? resumedBooking.date : booking.date
  const slot = useResumed ? { start: resumedBooking.startTime, end: resumedBooking.endTime } : booking.slot

  const [processing, setProcessing] = useState(false)
  const [useCredit, setUseCredit] = useState(true)
  // Kết quả checkout(): null | { bankTransfer, paymentId } | { paid: true }
  const [checkoutResult, setCheckoutResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  // Khách đã bấm "Tôi đã chuyển khoản" (hoặc mở lại đơn đã báo từ trước) → chỉ còn
  // chờ chủ sân xác nhận. Lúc này TUYỆT ĐỐI không hiện lại mã QR/nút báo.
  const [reported, setReported] = useState(false)
  const pollRef = useRef(null)

  // Khách quay lại từ một phiên trước (đóng tab rồi mở lại link cũ) — kiểm tra
  // trạng thái thật của đơn thay vì bắt bấm thanh toán lại từ đầu.
  const returningBookingId = returningId
  const [checkingResult, setCheckingResult] = useState(!!returningBookingId)
  const [resultStatus, setResultStatus] = useState(null)
  const [resultBooking, setResultBooking] = useState(null)

  useEffect(() => {
    if (!returningBookingId) return
    bookingService.getBookingById(returningBookingId)
      .then((res) => {
        setResultBooking(res.booking)
        if (res.booking?.status === 'confirmed') {
          setResultStatus('success')
          reset(); refreshUser()
        } else if (res.booking?.status === 'cancelled') {
          setResultStatus('failed')
        } else {
          if (res.booking?.status === 'awaiting_payment') setResumedBooking(res.booking)
          // Vẫn đang chờ chuyển khoản/xác nhận — coi như chưa có kết quả, để
          // khách tiếp tục ở màn hình thanh toán bình thường.
          setResultStatus(null)
        }
      })
      .catch(() => setResultStatus('failed'))
      .finally(() => setCheckingResult(false))
  }, [returningBookingId])

  // Đơn nối lại không có ảnh sân (BookingContext trống) — tải riêng, lỗi thì dùng ảnh mặc định.
  useEffect(() => {
    if (!resumedBooking?.venueId) return
    venueService.getVenueById(resumedBooking.venueId)
      .then((res) => setResumedVenueImage(res.venue?.images?.[0] || ''))
      .catch(() => {})
  }, [resumedBooking?.venueId])

  // ===== Đăng ký chờ xác nhận: tự kiểm tra định kỳ =====
  useEffect(() => {
    if (!checkoutResult?.paymentId) return undefined
    pollRef.current = setInterval(async () => {
      try {
        const res = await paymentService.getPaymentStatus(createdBooking._id)
        if (res.status === 'confirmed') {
          clearInterval(pollRef.current)
          reset(); refreshUser()
          navigate(`/payment?bookingId=${createdBooking._id}`)
        } else if (res.status === 'cancelled') {
          clearInterval(pollRef.current)
          navigate(`/payment?bookingId=${createdBooking._id}`)
        }
      } catch { /* bỏ qua lỗi tạm thời, thử lại ở vòng sau */ }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(pollRef.current)
  }, [checkoutResult?.paymentId])

  const amount = createdBooking?.amount || 0
  const serviceFee = createdBooking?.serviceFee || 0
  const discount = createdBooking?.discountAmount || 0
  const gross = amount + serviceFee - discount

  // Số dư ĐÃ được giữ chỗ cho đơn này ở một lần thanh toán trước (khách
  // thoát giữa chừng rồi quay lại). Khi đó số dư hiện tại của khách đã bị trừ
  // phần đó rồi — hiển thị theo phần đã giữ chỗ, đừng tính lại từ số dư.
  const creditLocked = (createdBooking?.creditApplied || 0) > 0

  const creditBalance = user?.creditBalance || 0
  const creditUsable = creditLocked
    ? createdBooking.creditApplied
    : (useCredit ? Math.min(creditBalance, gross) : 0)
  const afterCredit = Math.max(0, gross - creditUsable)

  const payable = afterCredit

  const handleCheckout = async () => {
    if (!createdBooking) {
      toast.error('Không tìm thấy thông tin đặt sân. Vui lòng thử lại từ đầu.')
      navigate('/venues')
      return
    }
    setProcessing(true)
    try {
      const res = await paymentService.checkout(createdBooking._id, useCredit)
      if (res.paid) {
        refreshUser()
        navigate(`/payment?bookingId=${createdBooking._id}`)
        return
      }
      setCheckoutResult(res)
      if (res.alreadyReported) setReported(true)
    } catch (err) {
      toast.error(err?.message || 'Không thể khởi tạo giao dịch. Vui lòng thử lại.')
    } finally {
      setProcessing(false)
    }
  }

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleMarkTransferred = async () => {
    setMarkingPaid(true)
    try {
      await paymentService.markTransferred(checkoutResult.paymentId)
      setReported(true)
      toast.success('Đã ghi nhận! Chủ sân sẽ xác nhận ngay khi kiểm tra được giao dịch.')
    } catch (err) {
      toast.error(err?.message || 'Không thể ghi nhận. Vui lòng thử lại.')
    } finally {
      setMarkingPaid(false)
    }
  }

  // ===== Đang kiểm tra kết quả (quay lại từ link cũ) =====
  if (checkingResult) {
    return (
      <div className={styles.centerState}>
        <Spinner size="lg" />
        <p>Đang kiểm tra trạng thái đơn...</p>
      </div>
    )
  }

  // ===== Thành công =====
  if (resultStatus === 'success' && resultBooking) {
    const paidTotal = resultBooking.amount + (resultBooking.serviceFee || 0) - (resultBooking.discountAmount || 0)
    return (
      <div className={styles.successPage}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}><PartyPopper size={40} /></div>
          <h1 className={styles.successTitle}>Đặt sân thành công!</h1>
          <p className={styles.successSub}>Giao dịch của bạn đã được xác nhận.</p>
          <div className={styles.successDetails}>
            <div className={styles.successRow}><span><LandPlot size={14} /> Sân</span><strong>{resultBooking.venueName}</strong></div>
            <div className={styles.successRow}><span><Calendar size={14} /> Ngày</span><strong>{formatDate(resultBooking.date)}</strong></div>
            <div className={styles.successRow}><span><Clock size={14} /> Giờ</span><strong>{formatTime(resultBooking.startTime)} – {formatTime(resultBooking.endTime)}</strong></div>
            {resultBooking.creditApplied > 0 && (
              <div className={styles.successRow}>
                <span><Gift size={14} /> Dùng số dư</span>
                <strong>{formatCurrency(resultBooking.creditApplied)}</strong>
              </div>
            )}
            <div className={styles.successRow}><span><BadgeDollarSign size={14} /> Tổng giá trị đơn</span><strong className={styles.paidAmount}>{formatCurrency(paidTotal)}</strong></div>
          </div>
          <div className={styles.successActions}>
            <Button onClick={() => navigate('/bookings')}>Xem lịch sử đặt sân</Button>
            <Button variant="outline" onClick={() => navigate('/')}>Về trang chủ</Button>
          </div>
        </div>
      </div>
    )
  }

  // ===== Thất bại / bị huỷ =====
  if (resultStatus === 'failed') {
    return (
      <div className={styles.successPage}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}><Frown size={40} /></div>
          <h1 className={styles.successTitle} style={{ color: 'var(--error)' }}>Đơn đã bị huỷ</h1>
          <p className={styles.successSub}>
            Đơn đã bị huỷ do quá hạn chuyển khoản hoặc không xác nhận được giao dịch.
            Nếu bạn đã dùng số dư khuyến mãi cho đơn này, nó đã được hoàn lại đầy đủ.
          </p>
          <div className={styles.successActions}>
            <Button onClick={() => navigate('/venues')}>Đặt sân khác</Button>
            <Button variant="outline" onClick={() => navigate('/')}>Về trang chủ</Button>
          </div>
        </div>
      </div>
    )
  }

  // ===== Chưa có booking nào để thanh toán =====
  if (!createdBooking || !venue) {
    return (
      <div className={styles.centerState}>
        <span style={{ display: 'flex', color: 'var(--text-muted)' }}><Frown size={48} /></span>
        <h2>Không có thông tin thanh toán</h2>
        <Button onClick={() => navigate('/venues')}>Tìm sân thể thao</Button>
      </div>
    )
  }

  // ===== Đã báo chuyển khoản: chỉ chờ chủ sân xác nhận (KHÔNG hiện lại QR) =====
  if (checkoutResult?.paymentId && reported) {
    return (
      <div className={styles.successPage}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}><Hourglass size={40} /></div>
          <h1 className={styles.successTitle}>Đã ghi nhận chuyển khoản</h1>
          <p className={styles.successSub}>
            Chủ sân đang đối chiếu và sẽ xác nhận sớm. Bạn <strong>không cần chuyển khoản lại</strong> —
            trang này tự cập nhật khi đơn được xác nhận.
          </p>
          <div className={styles.successDetails}>
            <div className={styles.successRow}><span><LandPlot size={14} /> Sân</span><strong>{venue?.name}</strong></div>
            <div className={styles.successRow}><span><Calendar size={14} /> Ngày</span><strong>{formatDate(date)}</strong></div>
            <div className={styles.successRow}><span><Clock size={14} /> Giờ</span><strong>{formatTime(slot?.start)} – {formatTime(slot?.end)}</strong></div>
            <div className={styles.successRow}><span><BadgeDollarSign size={14} /> Số tiền đã chuyển</span><strong className={styles.paidAmount}>{formatCurrency(checkoutResult.payable ?? payable)}</strong></div>
            {checkoutResult.orderRef && <div className={styles.successRow}><span><Copy size={14} /> Nội dung chuyển khoản</span><strong>{checkoutResult.orderRef}</strong></div>}
          </div>
          <div className={styles.successActions}>
            <Button onClick={() => navigate('/bookings')}>Xem lịch sử đặt sân</Button>
            <Button variant="outline" onClick={() => navigate('/')}>Về trang chủ</Button>
          </div>
        </div>
      </div>
    )
  }

  // ===== Đã tạo giao dịch chuyển khoản: hiển thị hướng dẫn + QR =====
  if (checkoutResult?.bankTransfer) {
    const bt = checkoutResult.bankTransfer
    if (!bt.configured) {
      return (
        <div className={styles.centerState}>
          <span style={{ display: 'flex', color: 'var(--error)' }}><Frown size={48} /></span>
          <h2>Chưa thể thanh toán lúc này</h2>
          <p style={{ color: 'var(--text-muted)' }}>Chủ sân chưa cập nhật tài khoản nhận thanh toán. Vui lòng liên hệ chủ sân hoặc thử lại sau.</p>
          <Button onClick={() => navigate('/bookings')}>Xem lịch sử đặt sân</Button>
        </div>
      )
    }

    return (
      <div className={styles.page}>
        <div className="container">
          <div className={styles.header}>
            <h1 className={styles.title}>Chuyển khoản để hoàn tất</h1>
            <p className={styles.sub}>Quét mã QR hoặc chuyển khoản thủ công trực tiếp cho chủ sân theo thông tin bên dưới</p>
          </div>

          <div className={styles.bankLayout}>
            <div className={styles.bankQrBox}>
              {bt.qrUrl && <img src={bt.qrUrl} alt="Mã QR chuyển khoản" className={styles.bankQrImg} />}
              <p className={styles.bankQrHint}>Mở app ngân hàng bất kỳ và quét mã này để tự điền sẵn thông tin</p>
            </div>

            <div className={styles.bankInfoBox}>
              <BankRow label="Ngân hàng" value={bt.bankName} />
              <BankRow label="Số tài khoản" value={bt.accountNumber} copyable onCopy={handleCopy} copied={copied} />
              <BankRow label="Chủ tài khoản" value={bt.accountName} />
              <BankRow label="Số tiền" value={formatCurrency(bt.amount)} highlight />
              <BankRow label="Nội dung chuyển khoản" value={bt.content} copyable onCopy={handleCopy} copied={copied} highlight />

              <div className={styles.noticeBox}>
                <span><Lock size={16} /></span>
                <p>
                  Nhập <strong>đúng nội dung</strong> ở trên khi chuyển khoản — đây là cách duy nhất để
                  chủ sân đối chiếu đúng đơn của bạn. Bạn có <strong>{bt.windowMinutes} phút</strong> để hoàn tất trước khi
                  đơn tự huỷ — nhưng ngay khi bạn bấm nút bên dưới, đơn sẽ được giữ nguyên cho tới khi được xác nhận.
                </p>
              </div>

              <p className={styles.confirmHint} style={{ marginBottom: 'var(--space-3)' }}>
                Chỉ chuyển <strong>một lần duy nhất</strong> với đúng số tiền ở trên. Sau khi chuyển xong trong app ngân hàng,
                hãy bấm nút bên dưới <strong>một lần</strong> để báo cho chủ sân.
              </p>
              <Button fullWidth size="xl" onClick={handleMarkTransferred} loading={markingPaid} disabled={markingPaid}>
                Tôi đã chuyển khoản
              </Button>
              <p className={styles.confirmHint}>
                Chủ sân sẽ đối chiếu và xác nhận trong thời gian sớm nhất.
                {' '}Trang này sẽ tự chuyển tiếp khi đơn được xác nhận.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== Chưa checkout: màn hình xác nhận trước khi tạo giao dịch =====
  const payingFully = payable === 0

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Hoàn tất thanh toán</h1>
          <p className={styles.sub}>Kiểm tra lại đơn trước khi chuyển khoản</p>
        </div>

        <div className={styles.layout}>
          <div className={styles.main}>
            {creditBalance > 0 && !creditLocked && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Số dư khuyến mãi</h2>
                <label className={styles.creditBox}>
                  <input
                    type="checkbox"
                    checked={useCredit}
                    onChange={(e) => setUseCredit(e.target.checked)}
                  />
                  <span className={styles.creditIcon}><Gift size={20} /></span>
                  <div className={styles.creditInfo}>
                    <span className={styles.creditLabel}>
                      Dùng số dư khuyến mãi ({formatCurrency(creditBalance)} khả dụng)
                    </span>
                    <span className={styles.creditDesc}>
                      {useCredit
                        ? `Trừ ${formatCurrency(creditUsable)} vào đơn này.`
                        : 'Số dư sẽ được giữ nguyên cho đơn sau.'}
                      {' '}Số dư chỉ dùng để trừ vào đơn đặt sân, không rút thành tiền mặt.
                    </span>
                  </div>
                </label>
              </div>
            )}

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Phương thức thanh toán</h2>
              <div className={styles.bankMethodCard}>
                <span className={styles.methodIcon}><Landmark size={24} /></span>
                <div className={styles.methodInfo}>
                  <span className={styles.methodLabel}>Chuyển khoản ngân hàng</span>
                  <span className={styles.methodDesc}>
                    {payingFully
                      ? 'Số dư khuyến mãi đủ trả toàn bộ đơn này — không cần chuyển khoản.'
                      : 'Quét mã QR hoặc chuyển khoản thủ công cho chủ sân. Chủ sân xác nhận sau khi nhận được tiền.'}
                  </span>
                </div>
              </div>
            </div>

            <Button fullWidth size="xl" onClick={handleCheckout} loading={processing}>
              {processing
                ? 'Đang xử lý...'
                : payingFully
                  ? 'Xác nhận đặt sân bằng số dư/điểm'
                  : `Tiếp tục — ${formatCurrency(payable)}`}
            </Button>
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.summaryCard}>
              <h3 className={styles.summaryTitle}>Tóm tắt đơn hàng</h3>
              <img src={getImageUrl(venue.images?.[0]) || 'https://placehold.co/400x200'} alt={venue.name} className={styles.venueImg} />
              <h4 className={styles.venueName}>{venue.name}</h4>
              <p className={styles.venueCourtInfo}><Trophy size={13} /> {court?.name}</p>
              <div className={styles.orderDetails}>
                <div className={styles.orderRow}><span><Calendar size={13} /> Ngày</span><strong>{formatDate(date)}</strong></div>
                <div className={styles.orderRow}><span><Clock size={13} /> Giờ</span><strong>{formatTime(slot?.start)} – {formatTime(slot?.end)}</strong></div>
              </div>
              <div className={styles.priceBreakdown}>
                <div className={styles.priceRow}><span>Tiền sân</span><span>{formatCurrency(amount)}</span></div>
                <div className={styles.priceRow}><span>Phí dịch vụ</span><span>{formatCurrency(serviceFee)}</span></div>
                {discount > 0 && (
                  <div className={styles.priceRow}>
                    <span>Giảm giá {createdBooking.promoCode ? `(${createdBooking.promoCode})` : ''}</span>
                    <span>−{formatCurrency(discount)}</span>
                  </div>
                )}
                {creditUsable > 0 && (
                  <div className={styles.priceRow}>
                    <span>Số dư khuyến mãi</span>
                    <span>−{formatCurrency(creditUsable)}</span>
                  </div>
                )}
                <div className={`${styles.priceRow} ${styles.priceTotal}`}>
                  <span>Còn phải trả</span><span>{formatCurrency(payable)}</span>
                </div>
              </div>
            </div>
          </aside>
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
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        )}
      </div>
    </div>
  )
}
