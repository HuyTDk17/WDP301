import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ClipboardList, Trophy, Calendar, Clock, ChevronUp, ChevronDown, StickyNote, X, Star, XCircle, Repeat, ArrowUpRight, Gift, CreditCard, Hourglass } from 'lucide-react'
import Badge from '@/components/ui/Badge/Badge'
import Button from '@/components/ui/Button/Button'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Spinner from '@/components/ui/Spinner/Spinner'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import AssignBookingModal from '@/components/booking/AssignBookingModal/AssignBookingModal'
import { bookingService, paymentService } from '@/services/bookingService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, formatTime, BOOKING_STATUS } from '@/utils'
import styles from './BookingHistory.module.css'

const TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'confirmed', label: 'Sắp tới' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'transferred', label: 'Đã chuyển' },
  { value: 'cancelled', label: 'Đã hủy' },
]

// Chỉ đơn đã xác nhận và còn đủ thời gian mới chuyển được. Điều kiện đầy đủ do
// máy chủ quyết định (BR-TR-01..07); ở đây chỉ lọc sơ bộ để khỏi hiện nút vô ích.
const MIN_TRANSFER_LEAD_HOURS = 2
const canTransfer = (b) => {
  if (b.status !== 'confirmed' || !b.customerId) return false
  const start = new Date(`${b.date}T${b.startTime}:00`)
  return (start.getTime() - Date.now()) / 3600000 >= MIN_TRANSFER_LEAD_HOURS
}

const PAYMENT_METHOD_LABEL = { bank_transfer: 'Chuyển khoản ngân hàng', credit: 'Số dư khuyến mãi', manual: 'Thanh toán tại sân' }
const shortCode = (id) => String(id || '').slice(-8).toUpperCase()
// Tổng giá trị đơn — cùng công thức với trang Thanh toán (có trừ giảm giá).
const orderTotal = (b) => (b.amount || 0) + (b.serviceFee || 0) - (b.discountAmount || 0)

function DetailRow({ label, value, strong, negative }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className={`${styles.detailRow} ${strong ? styles.detailTotal : ''}`}>
      <span>{label}</span>
      <span className={negative ? styles.detailNegative : ''}>{value}</span>
    </div>
  )
}

export default function BookingHistory() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tab, setTab] = useState('')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  // Chính sách huỷ do máy chủ tính — hiển thị TRƯỚC khi khách bấm huỷ để họ
  // thấy rõ mất bao nhiêu, và thấy chuyển sân thường rẻ hơn.
  const [cancelPreview, setCancelPreview] = useState(null)
  const [assignTarget, setAssignTarget] = useState(null)
  // Trạng thái giao dịch của các đơn đang 'Chờ thanh toán' (tải khi mở chi tiết):
  // { [bookingId]: payment | null }. Để phân biệt "chưa chuyển khoản" với "đã báo
  // chuyển, đang chờ chủ sân xác nhận".
  const [payments, setPayments] = useState({})

  const loadBookings = useCallback(() => {
    setLoading(true)
    bookingService.getMyBookings(tab ? { status: tab } : {})
      .then((res) => setBookings(res.bookings || []))
      .catch(() => toast.error('Không thể tải lịch sử đặt sân'))
      .finally(() => setLoading(false))
  }, [tab])

  useEffect(() => { loadBookings() }, [loadBookings])

  const toggleExpand = (booking) => {
    const opening = expandedId !== booking._id
    setExpandedId(opening ? booking._id : null)
    if (opening && booking.status === 'awaiting_payment') {
      paymentService.getPaymentStatus(booking._id)
        .then((res) => setPayments((prev) => ({ ...prev, [booking._id]: res.payment || null })))
        .catch(() => setPayments((prev) => ({ ...prev, [booking._id]: null })))
    }
  }

  const openCancel = async (booking) => {
    setCancelTarget(booking)
    setCancelPreview(null)
    // Đơn chưa thanh toán: không có khoản nào để hoàn nên không cần xem trước chính sách huỷ
    if (booking.status === 'awaiting_payment') return
    try {
      setCancelPreview(await bookingService.previewCancellation(booking._id))
    } catch { /* không lấy được thì vẫn cho huỷ, chỉ không hiện số liệu */ }
  }

  const handleCancel = async () => {
    try {
      await bookingService.cancelBooking(cancelTarget._id, 'Khách hàng tự hủy')
      toast.success('Đã hủy lượt đặt sân')
      setCancelTarget(null)
      setCancelPreview(null)
      loadBookings()
    } catch (err) {
      toast.error(err?.message || 'Không thể hủy lượt đặt sân')
    }
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <div><h1 className={styles.title}>Lịch sử đặt sân</h1><p className={styles.sub}>{loading ? 'Đang tải...' : `Tổng cộng ${bookings.length} lượt đặt sân`}</p></div>
          <div className={styles.headerActions}>
            <Link to="/claim"><Button icon={<Gift size={16} />} variant="ghost">Nhận suất</Button></Link>
            <Link to="/venues"><Button icon={<Plus size={16} />} variant="outline">Đặt sân mới</Button></Link>
          </div>
        </div>

        <div className={styles.tabs}>{TABS.map(t => <button key={t.value} className={`${styles.tab} ${tab === t.value ? styles.tabActive : ''}`} onClick={() => setTab(t.value)}>{t.label}</button>)}</div>

        {loading ? (
          <div className={styles.loadingState}><Spinner size="lg" /></div>
        ) : bookings.length === 0 ? (
          <EmptyState icon={<ClipboardList size={48} />} title="Không có lượt đặt sân nào" description="Bạn chưa có lượt đặt sân nào trong danh mục này." action={() => window.location.assign('/venues')} actionLabel="Tìm sân thể thao" />
        ) : (
          <div className={styles.list}>
            {bookings.map(booking => {
              const status = BOOKING_STATUS[booking.status] || BOOKING_STATUS.pending
              const transferable = canTransfer(booking)
              const isExpanded = expandedId === booking._id
              const canCancel = ['pending', 'confirmed'].includes(booking.status)

              return (
                <div key={booking._id} className={styles.bookingCard}>
                  <div className={styles.cardMain}>
                    <div className={styles.bookingInfo}>
                      <div className={styles.bookingHeader}>
                        <h3 className={styles.venueName}>{booking.venueName}</h3>
                        <Badge size="md" style={{ background: status.bg, color: status.color }}>{status.label}</Badge>
                      </div>
                      <p className={styles.venueLocation}><Trophy size={13} /> {booking.courtName}</p>
                      <div className={styles.bookingMeta}>
                        <span><Calendar size={13} /> {formatDate(booking.date)}</span>
                        <span><Clock size={13} /> {formatTime(booking.startTime)} – {formatTime(booking.endTime)}</span>
                      </div>
                    </div>
                    <div className={styles.bookingRight}>
                      <p className={styles.bookingTotal}>{formatCurrency(orderTotal(booking))}</p>
                      <button className={styles.expandBtn} onClick={() => toggleExpand(booking)}>{isExpanded ? <><ChevronUp size={13} /> Thu gọn</> : <><ChevronDown size={13} /> Chi tiết</>}</button>
                    </div>
                  </div>

                  {isExpanded && (() => {
                    const payment = payments[booking._id]
                    const awaitingPayment = booking.status === 'awaiting_payment'
                    const reportedTransfer = payment?.status === 'awaiting_confirmation'
                    // payments[id] chỉ có khóa khi đã gọi xong API (kể cả khi kết quả là null)
                    const paymentLoaded = booking._id in payments
                    // Đã báo chuyển khoản thì KHÔNG cho huỷ (máy chủ cũng chặn): tiền có thể đã về tài khoản chủ sân.
                    const canCancelNow = canCancel || (awaitingPayment && paymentLoaded && !reportedTransfer)
                    const showMethod = ['confirmed', 'completed', 'transferred'].includes(booking.status)
                    return (
                      <div className={styles.expandedSection}>
                        <div className={styles.detailGrid}>
                          <div className={styles.detailBlock}>
                            <h4 className={styles.detailTitle}>Thông tin lượt đặt</h4>
                            <DetailRow label="Mã đơn" value={`#${shortCode(booking._id)}`} />
                            <DetailRow label="Môn thể thao" value={booking.sport} />
                            <DetailRow label="Thời lượng" value={booking.duration ? `${booking.duration} giờ` : ''} />
                            {booking.createdAt && <DetailRow label="Đặt lúc" value={formatDate(booking.createdAt, 'dd/MM/yyyy HH:mm')} />}
                            {booking.notes && <p className={styles.notesText}><StickyNote size={13} /> {booking.notes}</p>}
                          </div>

                          <div className={styles.detailBlock}>
                            <h4 className={styles.detailTitle}>Thanh toán</h4>
                            <DetailRow label="Tiền sân" value={formatCurrency(booking.amount || 0)} />
                            {booking.serviceFee > 0 && <DetailRow label="Phí dịch vụ" value={formatCurrency(booking.serviceFee)} />}
                            {booking.discountAmount > 0 && (
                              <DetailRow label={`Giảm giá${booking.promoCode ? ` (${booking.promoCode})` : ''}`} value={`−${formatCurrency(booking.discountAmount)}`} negative />
                            )}
                            {booking.creditApplied > 0 && <DetailRow label="Dùng số dư khuyến mãi" value={`−${formatCurrency(booking.creditApplied)}`} negative />}
                            <DetailRow label="Tổng giá trị đơn" value={formatCurrency(orderTotal(booking))} strong />
                            {showMethod && <DetailRow label="Phương thức" value={PAYMENT_METHOD_LABEL[booking.paymentMethod] || booking.paymentMethod} />}
                          </div>
                        </div>

                        {awaitingPayment && (
                          <div className={styles.statusNote}>
                            {reportedTransfer ? (
                              <><Hourglass size={14} /> Bạn đã báo chuyển khoản. Chủ sân đang đối chiếu và sẽ xác nhận sớm — trạng thái đơn sẽ tự cập nhật.</>
                            ) : (
                              <><Clock size={14} /> Đơn đang chờ bạn thanh toán. Hoàn tất chuyển khoản để giữ chỗ; đơn quá hạn sẽ tự huỷ.</>
                            )}
                          </div>
                        )}

                        {booking.status === 'cancelled' && (
                          <div className={styles.statusNote}>
                            <XCircle size={14} />
                            <span>
                              Đơn đã huỷ{booking.cancellationReason ? ` — ${booking.cancellationReason}` : ''}.
                              {booking.refundAmount > 0 && ` Hoàn tiền: ${formatCurrency(booking.refundAmount)}.`}
                              {booking.refundCreditAmount > 0 && ` Hoàn vào số dư: ${formatCurrency(booking.refundCreditAmount)}.`}
                              {booking.cancellationFee > 0 && ` Phí huỷ: ${formatCurrency(booking.cancellationFee)}.`}
                            </span>
                          </div>
                        )}

                        <div className={styles.expandedActions}>
                          {/* Đơn chưa thanh toán: dẫn về màn hình chuyển khoản. Đã báo
                              chuyển rồi thì KHÔNG cho thanh toán lại — sẽ sinh thêm một
                              giao dịch thứ hai cho cùng một đơn. */}
                          {awaitingPayment && !reportedTransfer && (
                            <Button size="sm" icon={<CreditCard size={13} />} disabled={!paymentLoaded} onClick={() => navigate(`/payment?bookingId=${booking._id}`)}>Thanh toán</Button>
                          )}
                          {/* Đặt TRƯỚC nút huỷ và làm nổi bật hơn: chuyển sân giữ
                              lại giá trị cho cả ba bên, huỷ thì mất hết. */}
                          {transferable && (
                            <Link to={`/bookings/${booking._id}/transfer`}>
                              <Button size="sm" icon={<Repeat size={13} />}>Chuyển sân</Button>
                            </Link>
                          )}
                          {transferable && (
                            <Button variant="outline" size="sm" icon={<Gift size={13} />} onClick={() => setAssignTarget(booking)}>Sang tên</Button>
                          )}
                          {canCancelNow && <Button variant="danger" size="sm" icon={<X size={13} />} onClick={() => openCancel(booking)}>Hủy lượt đặt</Button>}
                          {booking.status === 'completed' && <Button variant="outline" size="sm" icon={<Star size={13} />}>Đánh giá</Button>}
                          {booking.status === 'transferred' && booking.transferredToBookingId && (
                            <span className={styles.transferNote}>
                              <ArrowUpRight size={13} /> Đã chuyển sang lượt đặt khác
                              {booking.compensationAmount > 0 && ` · chủ sân nhận bồi thường ${formatCurrency(booking.compensationAmount)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelPreview(null) }}
        onConfirm={handleCancel}
        title="Hủy lượt đặt sân"
        message={cancelPreview
          ? `Bạn đã thanh toán ${formatCurrency(cancelPreview.paid)}. Hủy lúc này bạn được hoàn ${formatCurrency(cancelPreview.refundAmount)} (${Math.round(cancelPreview.refundRate * 100)}% tiền sân), mất ${formatCurrency(cancelPreview.cancellationFee)}. Nếu chỉ bận đột xuất, chuyển sân thường rẻ hơn hủy.`
          : cancelTarget?.status === 'awaiting_payment'
            ? `Đơn tại "${cancelTarget?.venueName}" chưa thanh toán nên hủy không mất phí. Số dư/điểm đã giữ chỗ cho đơn này (nếu có) sẽ được hoàn lại. Nếu bạn đã chuyển khoản, đừng hủy — hãy chờ chủ sân xác nhận.`
            : `Bạn có chắc muốn hủy lượt đặt tại "${cancelTarget?.venueName}"?`}
        confirmLabel="Hủy lượt đặt"
        icon={<XCircle size={28} />}
      />

      <AssignBookingModal
        booking={assignTarget}
        isOpen={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        onDone={loadBookings}
      />
    </div>
  )
}
