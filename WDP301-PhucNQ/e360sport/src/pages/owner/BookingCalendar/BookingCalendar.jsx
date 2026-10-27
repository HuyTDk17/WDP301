import { useState, useMemo, useEffect, useCallback, Fragment } from 'react'
import { ChevronLeft, ChevronRight, LandPlot, Trophy, Pin, XCircle } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import CalendarSlot from '@/components/owner/CalendarSlot/CalendarSlot'
import BookingQuickModal from '@/components/owner/BookingQuickModal/BookingQuickModal'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { useToast } from '@/contexts/ToastContext'
import { venueService } from '@/services/venueService'
import { bookingService } from '@/services/bookingService'
import { toLocalISODate } from '@/utils'
import styles from './BookingCalendar.module.css'

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function isoDate(d) { return toLocalISODate(d) }
function isSameDay(a, b) { return isoDate(a) === isoDate(b) }
function formatDayLabel(d) { return d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'short' }) }

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6) // 06:00 → 21:00

export default function BookingCalendar() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [venues, setVenues] = useState([])
  const [courts, setCourts] = useState([])
  const [bookings, setBookings] = useState([])

  const [venueId, setVenueId] = useState('')
  const [weekStart, setWeekStart] = useState(startOfDay(new Date()))
  const [viewMode, setViewMode] = useState('week')
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()))
  const [quickModal, setQuickModal] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)

  const loadAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      venueService.getOwnerVenues(),
      venueService.getOwnerCourts(),
      bookingService.getOwnerBookings(),
    ]).then(([venuesRes, courtsRes, bookingsRes]) => {
      const v = venuesRes.venues || []
      setVenues(v)
      setCourts(courtsRes.courts || [])
      setBookings(bookingsRes.bookings || [])
      if (v.length > 0 && !venueId) setVenueId(v[0]._id)
    }).catch(() => toast.error('Không thể tải dữ liệu lịch đặt sân'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const venueCourts = courts.filter(c => c.venueId === venueId && c.status !== 'maintenance')
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const findBooking = (courtId, date, hour) => {
    const hh = String(hour).padStart(2, '0') + ':00'
    return bookings.find(b => b.courtId === courtId && b.date === isoDate(date) && b.status !== 'cancelled' && hh >= b.startTime && hh < b.endTime)
  }
  const isPastSlot = (date, hour) => { const d = new Date(date); d.setHours(hour, 0, 0, 0); return d < new Date() }

  const handleSlotClick = (court, date, hour) => {
    const booking = findBooking(court._id, date, hour)
    const hh = String(hour).padStart(2, '0') + ':00'
    const hhEnd = String(hour + 1).padStart(2, '0') + ':00'
    const venue = venues.find(v => v._id === venueId)

    if (booking) {
      setQuickModal({ mode: 'view', booking })
    } else {
      if (isPastSlot(date, hour)) return
      setQuickModal({
        mode: 'create',
        slotInfo: { courtId: court._id, courtName: court.name, venueName: venue?.name, date: formatDayLabel(date), rawDate: isoDate(date), time: hh, endTime: hhEnd, pricePerHour: court.pricePerHour, sport: court.type },
      })
    }
  }

  // Chủ sân tạo lượt đặt thủ công (VD: khách gọi điện đặt trực tiếp)
  const handleCreateBooking = async (form) => {
    const { slotInfo } = quickModal
    try {
      await bookingService.createManualBooking({
        venueId,
        courtId: slotInfo.courtId,
        date: slotInfo.rawDate,
        startTime: slotInfo.time,
        endTime: slotInfo.endTime,
        customerName: form.customerName,
        phone: form.phone,
      })
      toast.success(`Đã tạo lượt đặt sân cho ${form.customerName}`)
      setQuickModal(null)
      loadAll()
    } catch (err) {
      toast.error(err?.message || 'Không thể tạo lượt đặt sân')
      throw err
    }
  }

  const handleStatusChange = async (newStatus) => {
    if (newStatus === 'cancelled') { setCancelTarget(quickModal.booking); return }
    try {
      await bookingService.updateBookingStatus(quickModal.booking._id, newStatus)
      toast.success('Đã cập nhật trạng thái lượt đặt')
      setQuickModal(null)
      loadAll()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái')
    }
  }

  const confirmCancel = async () => {
    try {
      await bookingService.updateBookingStatus(cancelTarget._id, 'cancelled')
      toast.success('Đã hủy lượt đặt sân')
      setCancelTarget(null)
      setQuickModal(null)
      loadAll()
    } catch (err) {
      toast.error(err?.message || 'Không thể hủy lượt đặt')
    }
  }

  const goToToday = () => { setWeekStart(startOfDay(new Date())); setSelectedDay(startOfDay(new Date())) }
  const shiftWeek = (n) => setWeekStart(prev => addDays(prev, n * 7))
  const shiftDay = (n) => setSelectedDay(prev => addDays(prev, n))
  const dayBookingsCount = (date) => bookings.filter(b => b.venueId === venueId && b.date === isoDate(date) && b.status !== 'cancelled').length

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  if (venues.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader title="Lịch đặt sân" subtitle="Xem trực quan tất cả lượt đặt sân theo từng giờ" />
        <EmptyState icon={<LandPlot size={48} />} title="Chưa có địa điểm nào" description="Đăng địa điểm và thêm sân trước khi xem lịch đặt." action={() => window.location.assign('/owner/venues/create')} actionLabel="Đăng địa điểm" />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Lịch đặt sân" subtitle="Xem trực quan tất cả lượt đặt sân theo từng giờ" />

      <div className={styles.controls}>
        <div className={styles.controlsLeft}>
          <select className={styles.venueSelect} value={venueId} onChange={e => setVenueId(e.target.value)}>
            {venues.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
          </select>
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('week')}>Tuần</button>
            <button className={`${styles.viewBtn} ${viewMode === 'day' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('day')}>Ngày</button>
          </div>
        </div>
        <div className={styles.controlsRight}>
          {viewMode === 'week' ? (
            <><button className={styles.navBtn} onClick={() => shiftWeek(-1)}><ChevronLeft size={16} /></button><span className={styles.rangeLabel}>{formatDayLabel(days[0])} – {formatDayLabel(days[6])}</span><button className={styles.navBtn} onClick={() => shiftWeek(1)}><ChevronRight size={16} /></button></>
          ) : (
            <><button className={styles.navBtn} onClick={() => shiftDay(-1)}><ChevronLeft size={16} /></button><span className={styles.rangeLabel}>{formatDayLabel(selectedDay)}</span><button className={styles.navBtn} onClick={() => shiftDay(1)}><ChevronRight size={16} /></button></>
          )}
          <Button size="sm" variant="outline" onClick={goToToday}>Hôm nay</Button>
        </div>
      </div>

      <div className={styles.legend}>
        {[{ label: 'Đã xác nhận', cls: 'confirmed' }, { label: 'Chờ xác nhận', cls: 'pending' }, { label: 'Hoàn tất', cls: 'completed' }, { label: 'Còn trống', cls: 'empty' }].map(l => (
          <span key={l.label} className={styles.legendItem}><span className={`${styles.legendDot} ${styles[l.cls]}`} />{l.label}</span>
        ))}
      </div>

      {venueCourts.length === 0 ? (
        <EmptyState icon={<Trophy size={48} />} title="Địa điểm này chưa có sân nào" description="Thêm sân trong mục Quản lý sân để bắt đầu nhận đặt." action={() => window.location.assign('/owner/courts')} actionLabel="Quản lý sân" />
      ) : viewMode === 'week' ? (
        <div className={styles.weekWrapper}>
          <div className={styles.weekGrid} style={{ gridTemplateColumns: `70px repeat(7, 1fr)` }}>
            <div className={styles.cornerCell} />
            {days.map(d => (
              <div key={isoDate(d)} className={`${styles.dayHeader} ${isSameDay(d, new Date()) ? styles.todayHeader : ''}`}>
                <span className={styles.dayName}>{d.toLocaleDateString('vi-VN', { weekday: 'short' })}</span>
                <span className={styles.dayNum}>{d.getDate()}</span>
                <span className={styles.dayCount}>{dayBookingsCount(d)} lượt</span>
              </div>
            ))}
            {HOURS.map(hour => (
              <Fragment key={`week-row-${hour}`}>
                <div className={styles.timeCell}>{String(hour).padStart(2, '0')}:00</div>
                {days.map(d => {
                  const court = venueCourts[0]
                  const booking = findBooking(court._id, d, hour)
                  return (
                    <div key={isoDate(d) + hour} className={styles.cell}>
                      <CalendarSlot booking={booking} isPast={isPastSlot(d, hour)} onClick={() => handleSlotClick(court, d, hour)} />
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
          {venueCourts.length > 1 && (
            <p className={styles.weekNote}><Pin size={13} /> Xem theo tuần chỉ hiển thị sân <strong>{venueCourts[0]?.name}</strong>. Chuyển sang <strong>xem theo ngày</strong> để xem tất cả {venueCourts.length} sân cùng lúc.</p>
          )}
        </div>
      ) : (
        <div className={styles.dayWrapper}>
          <div className={styles.dayGrid} style={{ gridTemplateColumns: `70px repeat(${venueCourts.length}, 1fr)` }}>
            <div className={styles.cornerCell} />
            {venueCourts.map(c => <div key={c._id} className={styles.courtHeader}><span className={styles.courtName}>{c.name}</span><span className={styles.courtSub}>{c.size}</span></div>)}
            {HOURS.map(hour => (
              <Fragment key={`day-row-${hour}`}>
                <div className={styles.timeCell}>{String(hour).padStart(2, '0')}:00</div>
                {venueCourts.map(court => {
                  const booking = findBooking(court._id, selectedDay, hour)
                  return <div key={court._id + hour} className={styles.cell}><CalendarSlot booking={booking} isPast={isPastSlot(selectedDay, hour)} onClick={() => handleSlotClick(court, selectedDay, hour)} /></div>
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <BookingQuickModal isOpen={!!quickModal} onClose={() => setQuickModal(null)} mode={quickModal?.mode} booking={quickModal?.booking} slotInfo={quickModal?.slotInfo} onConfirmStatus={handleStatusChange} onCreateBooking={handleCreateBooking} />
      <ConfirmModal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={confirmCancel} title="Hủy lượt đặt sân" message={`Hủy lượt đặt sân của ${cancelTarget?.customerId?.name || 'khách hàng'}?`} confirmLabel="Hủy lượt đặt" icon={<XCircle size={28} />} />
    </div>
  )
}
