import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, LayoutGrid, Calendar, Clock, ClipboardList, Lock, Frown, ArrowRight } from 'lucide-react'
import { useBooking } from '@/contexts/BookingContext'
import { useToast } from '@/contexts/ToastContext'
import { bookingService } from '@/services/bookingService'
import { settingsService } from '@/services/settingsService'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import HoldTimer from '@/components/booking/HoldTimer/HoldTimer'
import { formatCurrency, formatDate, formatTime, getSport, getImageUrl, previewCommission } from '@/utils'
import styles from './Booking.module.css'

export default function Booking() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { booking, setHold, setSport, setNotes, setBookingResult } = useBooking()
  const { venue, court, date, slot, hold } = booking

  const [holding, setHolding] = useState(true)
  const [holdError, setHoldError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const holdRequested = useRef(false)

  // Môn do SÂN quyết định (chủ sân khai) — khách không đổi được; máy chủ cũng tự ép lại khi tạo đơn.
  const sport = court?.type || venue?.sports?.[0] || ''
  const [notes, setLocalNotes] = useState('')
  // Tỉ lệ hoa hồng lấy từ cài đặt hệ thống (admin có thể đổi) thay vì hardcode
  // 5% — số tiền chính xác vẫn do backend tính lại khi tạo booking thật,
  // đây chỉ là giá trị XEM TRƯỚC để khách hàng biết trước khi xác nhận.
  // Hoa hồng chia giữa khách và chủ sân; khách chỉ trả phần `customerSharePct` (mặc định 0 = chủ sân chịu hết).
  const [commissionRate, setCommissionRate] = useState(5)
  const [customerSharePct, setCustomerSharePct] = useState(0)
  useEffect(() => {
    settingsService.getPublicSettings()
      .then(s => { setCommissionRate(s.commissionRate); setCustomerSharePct(s.commissionCustomerSharePct ?? 0) })
      .catch(() => {})
  }, [])


  // Nếu thiếu thông tin cần thiết (truy cập trực tiếp URL mà chưa chọn sân/giờ), quay lại
  useEffect(() => {
    if (!venue || !court || !date || !slot) {
      navigate('/venues')
    }
  }, [venue, court, date, slot, navigate])

  // Giữ chỗ tạm thời ngay khi vào trang — chỉ gọi 1 lần
  useEffect(() => {
    if (!venue || !court || !date || !slot || holdRequested.current) return
    holdRequested.current = true

    bookingService.holdSlot({
      venueId: venue._id,
      courtId: court._id,
      date,
      startTime: slot.start,
      endTime: slot.end,
    })
      .then((res) => {
        setHold(res.hold || res) // tùy backend trả { hold: {...} } hoặc trả thẳng {...}
        setHolding(false)
      })
      .catch((err) => {
        setHoldError(err?.message || 'Không thể giữ chỗ — khung giờ này có thể vừa có người đặt.')
        setHolding(false)
      })
  }, [venue, court, date, slot])

  const handleHoldExpired = () => {
    toast.warning('Đã hết thời gian giữ chỗ. Vui lòng chọn lại khung giờ.')
    navigate(`/venues/${venue._id}`)
  }

  const handleSubmit = async () => {
    if (!hold) return
    setSubmitting(true)
    try {
      const res = await bookingService.createBooking({
        holdId: hold.holdId,
        notes,
      })
      setBookingResult(res.booking)
      setSport(sport); setNotes(notes)
      navigate('/payment')
    } catch (err) {
      toast.error(err?.message || 'Đặt sân không thành công. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!venue || !court || !date || !slot) return null

  if (holding) {
    return (
      <div className={styles.centerState}>
        <Spinner size="lg" />
        <p>Đang giữ chỗ cho bạn...</p>
      </div>
    )
  }

  if (holdError) {
    return (
      <div className={styles.centerState}>
        <span className={styles.errorIcon}><Frown size={40} strokeWidth={1.75} /></span>
        <h2>Không thể giữ chỗ</h2>
        <p className={styles.errorText}>{holdError}</p>
        <Button onClick={() => navigate(`/venues/${venue._id}`)}>Chọn khung giờ khác</Button>
      </div>
    )
  }

  const pricePerHour = court.pricePerHour
  const fee = previewCommission(pricePerHour, commissionRate, customerSharePct)
  const serviceFee = fee.serviceFee
  const total = pricePerHour + serviceFee

  return (
    <div className={styles.page}>
      <div className="container">
        {hold?.expiresAt && <HoldTimer expiresAt={hold.expiresAt} onExpire={handleHoldExpired} />}

        <div className={styles.layout}>
          <div className={styles.content}>
            <h2 className={styles.stepTitle}>Hoàn tất thông tin đặt sân</h2>

            <div className={styles.confirmCard}>
              <img src={getImageUrl(venue.images?.[0]) || 'https://placehold.co/200x130'} alt={venue.name} className={styles.confirmImg} />
              <div className={styles.confirmInfo}>
                <h3 className={styles.confirmVenueName}>{venue.name}</h3>
                <p className={styles.confirmLocation}><MapPin size={13} strokeWidth={2.25} /> {venue.address?.district}, {venue.address?.city}</p>
                <p className={styles.confirmCourt}><LayoutGrid size={13} strokeWidth={2.25} /> {court.name}</p>
              </div>
            </div>

            <div className={styles.confirmDetails}>
              <div className={styles.confirmRow}><span><Calendar size={14} strokeWidth={2.25} /> Ngày</span><strong>{formatDate(date)}</strong></div>
              <div className={styles.confirmRow}><span><Clock size={14} strokeWidth={2.25} /> Khung giờ</span><strong>{formatTime(slot.start)} – {formatTime(slot.end)}</strong></div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.label}>Môn thể thao</label>
                <div className={styles.fixedValue}>{getSport(sport) ? `${getSport(sport).icon} ${getSport(sport).name}` : '—'}</div>
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Yêu cầu đặc biệt (không bắt buộc)</label>
              <textarea className={styles.textarea} placeholder="Ghi chú gửi đến chủ sân..." value={notes} onChange={e => setLocalNotes(e.target.value)} rows={3} />
            </div>

            <div className={styles.policyBox}>
              <h4 className={styles.policyTitle}><ClipboardList size={16} strokeWidth={2.25} /> Chính sách đặt sân</h4>
              <ul className={styles.policyList}>
                <li>Miễn phí hủy trước 24 giờ so với giờ đặt</li>
                <li>Hoàn 50% nếu hủy trước 12–24 giờ</li>
                <li>Không hoàn tiền nếu hủy dưới 12 giờ</li>
              </ul>
            </div>
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.summaryCard}>
              <h3 className={styles.summaryTitle}>Tóm tắt đơn</h3>
              <div className={styles.priceBreakdown}>
                <div className={styles.priceRow}><span>{formatCurrency(pricePerHour)} × 1 giờ</span><span>{formatCurrency(pricePerHour)}</span></div>
                {serviceFee > 0 && (
                  <div className={styles.priceRow}><span>Phí dịch vụ</span><span>{formatCurrency(serviceFee)}</span></div>
                )}

                <div className={`${styles.priceRow} ${styles.priceTotal}`}><span>Tổng cộng</span><span>{formatCurrency(total)}</span></div>
              </div>
              <Button fullWidth size="lg" onClick={handleSubmit} loading={submitting} iconRight={<ArrowRight size={16} />}>Tiếp tục thanh toán</Button>
              <div className={styles.securityNote}><Lock size={12} strokeWidth={2.25} /><span>Thông tin được bảo mật</span></div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
