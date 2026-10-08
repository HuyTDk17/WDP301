import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Heart, MapPin, LayoutGrid, Clock, Check, ChevronUp, ChevronDown, CreditCard, Frown, Calendar } from 'lucide-react'
import Rating from '@/components/ui/Rating/Rating'
import Badge from '@/components/ui/Badge/Badge'
import Button from '@/components/ui/Button/Button'
import Avatar from '@/components/ui/Avatar/Avatar'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import TimeSlotPicker from '@/components/venue/TimeSlotPicker/TimeSlotPicker'
import CourtPicker from '@/components/booking/CourtPicker/CourtPicker'
import { venueService } from '@/services/venueService'
import { settingsService } from '@/services/settingsService'
import { formatCurrency, formatDate, getSport, buildAvailableSlots, getAvatarPlaceholder, getImageUrl, previewCommission, toLocalISODate } from '@/utils'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { useBooking } from '@/contexts/BookingContext'
import styles from './VenueDetail.module.css'

export default function VenueDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const { toast } = useToast()
  const { setVenue, setCourt, setDate, setSlot } = useBooking()

  const [venue, setVenueData] = useState(null)
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeImage, setActiveImage] = useState(0)
  const [showAllAmenities, setShowAllAmenities] = useState(false)
  const [isFav, setIsFav] = useState(false)
  // Xem ghi chú tương tự trong Booking.jsx — lấy % hoa hồng thật từ cài đặt
  // hệ thống thay vì hardcode, chỉ dùng để xem trước giá.
  const [commissionRate, setCommissionRate] = useState(5)
  const [customerSharePct, setCustomerSharePct] = useState(0) // phần hoa hồng khách chịu (0 = chủ sân chịu hết)
  useEffect(() => {
    settingsService.getPublicSettings()
      .then(s => { setCommissionRate(s.commissionRate); setCustomerSharePct(s.commissionCustomerSharePct ?? 0) })
      .catch(() => {})
  }, [])

  // Trạng thái lựa chọn đặt sân
  const [selectedCourt, setSelectedCourt] = useState(null)
  const [selectedDate, setSelectedDate] = useState(toLocalISODate())
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [slotsData, setSlotsData] = useState(null)
  const [slotsLoading, setSlotsLoading] = useState(false)

  // Tải thông tin địa điểm
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      venueService.getVenueById(id),
      venueService.getVenueReviews(id).catch(() => ({ reviews: [] })),
    ])
      .then(([venueRes, reviewsRes]) => {
        if (cancelled) return
        setVenueData(venueRes.venue)
        setReviews(reviewsRes.reviews || [])
        // Tự chọn sân đầu tiên còn hoạt động, nếu có
        const firstActiveCourt = venueRes.venue?.courts?.find(c => c.status === 'active')
        if (firstActiveCourt) setSelectedCourt(firstActiveCourt)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Không thể tải thông tin địa điểm này')
      })
      .finally(() => !cancelled && setLoading(false))

    return () => { cancelled = true }
  }, [id])

  // Tải khung giờ mỗi khi đổi sân hoặc đổi ngày
  const loadSlots = useCallback(() => {
    if (!venue || !selectedCourt) return
    setSlotsLoading(true)
    setSelectedSlot(null)
    venueService.getCourtSlots(venue._id, selectedCourt._id, selectedDate)
      .then((res) => setSlotsData(res))
      .catch(() => setSlotsData({ bookedSlots: [] }))
      .finally(() => setSlotsLoading(false))
  }, [venue, selectedCourt, selectedDate])

  useEffect(() => { loadSlots() }, [loadSlots])

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !venue) {
    return (
      <div className="container">
        <EmptyState
          icon={<Frown size={40} strokeWidth={1.75} />}
          title="Không tìm thấy địa điểm này"
          description={error || 'Địa điểm có thể đã bị xóa hoặc đường dẫn không đúng.'}
          action={() => navigate('/venues')}
          actionLabel="Quay lại tìm sân"
        />
      </div>
    )
  }

  const sport = getSport(venue.sports?.[0])
  const courts = venue.courts || []
  const images = (venue.images?.length ? venue.images : ['https://placehold.co/800x500?text=Chưa+có+ảnh']).map(getImageUrl)

  const slots = selectedCourt
    ? buildAvailableSlots(venue.openHours?.open, venue.openHours?.close, 60, selectedDate, slotsData?.bookedSlots || [])
    : []

  const totalPrice = selectedSlot ? (selectedCourt?.pricePerHour || 0) : 0
  const serviceFee = previewCommission(totalPrice, commissionRate, customerSharePct).serviceFee

  const displayedAmenities = showAllAmenities ? venue.amenities : (venue.amenities || []).slice(0, 6)

  const handleBook = () => {
    if (!isAuthenticated) { toast.info('Vui lòng đăng nhập để đặt sân này'); navigate('/login'); return }
    if (user?.role !== 'customer') { toast.info('Chỉ tài khoản khách hàng mới có thể đặt sân'); return }
    if (!selectedCourt) { toast.warning('Vui lòng chọn sân'); return }
    if (!selectedSlot) { toast.warning('Vui lòng chọn khung giờ'); return }

    // Đưa lựa chọn vào BookingContext rồi chuyển sang trang đặt sân,
    // nơi sẽ gọi bookingService.holdSlot() để giữ chỗ tạm thời.
    setVenue(venue)
    setCourt(selectedCourt)
    setDate(selectedDate)
    setSlot(selectedSlot)
    navigate(`/booking/${venue._id}`)
  }

  return (
    <div className={styles.page}>
      <div className={`container ${styles.breadcrumb}`}>
        <Link to="/venues" className={styles.breadLink}>Sân thể thao</Link><ChevronRight size={14} strokeWidth={2.25} className={styles.breadSep} /><span>{venue.name}</span>
      </div>

      <div className={`container ${styles.gallery}`}>
        <div className={styles.galleryMain}>
          <img src={images[activeImage]} alt={venue.name} className={styles.galleryMainImg} />
          <button className={`${styles.favBtnLarge} ${isFav ? styles.favActive : ''}`} onClick={() => setIsFav(v => !v)} aria-label={isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}>
            <Heart size={19} strokeWidth={2.25} fill={isFav ? 'currentColor' : 'none'} />
          </button>
        </div>
        {images.length > 1 && (
          <div className={styles.galleryThumbs}>
            {images.map((img, i) => (
              <button key={i} className={`${styles.thumb} ${i === activeImage ? styles.thumbActive : ''}`} onClick={() => setActiveImage(i)}>
                <img src={img} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`container ${styles.body}`}>
        <div className={styles.main}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              {sport && <Badge variant="primary" size="lg">{sport.icon} {sport.name}</Badge>}
              <h1 className={styles.title}>{venue.name}</h1>
              <div className={styles.meta}>
                <Rating value={venue.rating || 0} size="md" count={venue.reviewCount || 0} />
                <span className={styles.metaDot}>·</span>
                <span className={styles.metaText}><MapPin size={14} strokeWidth={2.25} className={styles.metaIcon} /> {venue.address?.street}, {venue.address?.district}, {venue.address?.city}</span>
              </div>
            </div>
          </div>

          <div className={styles.quickInfo}>
            <div className={styles.quickInfoItem}><span className={styles.quickInfoIcon}><LayoutGrid size={18} strokeWidth={2} /></span><div><p className={styles.quickInfoLabel}>Số sân</p><p className={styles.quickInfoValue}>{courts.length} sân</p></div></div>
            <div className={styles.quickInfoItem}><span className={styles.quickInfoIcon}><Clock size={18} strokeWidth={2} /></span><div><p className={styles.quickInfoLabel}>Giờ mở cửa</p><p className={styles.quickInfoValue}>{venue.openHours?.open} – {venue.openHours?.close}</p></div></div>
          </div>

          {venue.description && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Giới thiệu về sân</h2>
              <p className={styles.description}>{venue.description}</p>
            </section>
          )}

          {venue.amenities?.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Tiện ích</h2>
              <div className={styles.amenitiesGrid}>{displayedAmenities.map(a => <div key={a} className={styles.amenityItem}><span className={styles.amenityCheck}><Check size={13} strokeWidth={3} /></span><span>{a}</span></div>)}</div>
              {venue.amenities.length > 6 && (
                <button className={styles.showMoreBtn} onClick={() => setShowAllAmenities(v => !v)}>
                  {showAllAmenities ? <>Thu gọn <ChevronUp size={14} strokeWidth={2.25} /></> : <>Xem tất cả {venue.amenities.length} tiện ích <ChevronDown size={14} strokeWidth={2.25} /></>}
                </button>
              )}
            </section>
          )}

          {venue.rules && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Quy định của sân</h2>
              <p className={styles.description}>{venue.rules}</p>
            </section>
          )}

          <section className={styles.section}>
            <div className={styles.reviewsHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Đánh giá</h2>
                <div className={styles.reviewSummary}>
                  <span className={styles.reviewScore}>{venue.rating || 0}</span>
                  <Rating value={venue.rating || 0} size="lg" />
                  <span className={styles.reviewTotal}>({venue.reviewCount || 0} đánh giá)</span>
                </div>
              </div>
            </div>
            {reviews.length === 0 ? (
              <p className={styles.noReviews}>Chưa có đánh giá nào cho địa điểm này.</p>
            ) : (
              <div className={styles.reviewsList}>
                {reviews.map(review => (
                  <div key={review._id} className={styles.reviewCard}>
                    <div className={styles.reviewHeader}>
                      <Avatar src={getAvatarPlaceholder(review.userId?.name || 'Khách')} name={review.userId?.name} size="md" />
                      <div className={styles.reviewMeta}>
                        <p className={styles.reviewName}>{review.userId?.name || 'Khách hàng'}</p>
                        <div className={styles.reviewRatingRow}><Rating value={review.rating} size="sm" /><span className={styles.reviewDate}>{formatDate(review.createdAt)}</span></div>
                      </div>
                    </div>
                    <p className={styles.reviewComment}>{review.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Khung đặt sân */}
        <aside className={styles.bookingPanel}>
          <div className={styles.bookingCard}>
            <h3 className={styles.bookingCardTitle}>Đặt sân</h3>

            <div className={styles.bookingField}>
              <label className={styles.bookingLabel}><LayoutGrid size={14} strokeWidth={2.25} /> Chọn sân</label>
              <CourtPicker
                courts={courts}
                selectedCourtId={selectedCourt?._id}
                onSelect={setSelectedCourt}
              />
            </div>

            <div className={styles.bookingField}>
              <label className={styles.bookingLabel}><Calendar size={14} strokeWidth={2.25} /> Chọn ngày</label>
              <input
                type="date"
                className={styles.datePicker}
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                min={toLocalISODate()}
              />
            </div>

            {selectedCourt && (
              <div className={styles.bookingField}>
                <label className={styles.bookingLabel}><Clock size={14} strokeWidth={2.25} /> Khung giờ trống</label>
                <TimeSlotPicker
                  slots={slots}
                  selected={selectedSlot ? [selectedSlot] : []}
                  onToggle={(slot) => setSelectedSlot(prev => prev?.start === slot.start ? null : slot)}
                  loading={slotsLoading}
                  maxSlots={1}
                />
              </div>
            )}

            {selectedSlot && selectedCourt && (
              <div className={styles.priceSummary}>
                <div className={styles.summaryRow}><span>{formatCurrency(selectedCourt.pricePerHour)} × 1 giờ</span><span>{formatCurrency(totalPrice)}</span></div>
                {serviceFee > 0 && (
                  <div className={styles.summaryRow}><span>Phí dịch vụ</span><span>{formatCurrency(serviceFee)}</span></div>
                )}
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}><span>Tổng cộng</span><span>{formatCurrency(totalPrice + serviceFee)}</span></div>
              </div>
            )}

            <Button fullWidth size="lg" onClick={handleBook} disabled={!selectedCourt || !selectedSlot}>
              {!selectedCourt ? 'Chọn sân' : !selectedSlot ? 'Chọn khung giờ' : `Đặt ngay — ${formatCurrency(totalPrice + serviceFee)}`}
            </Button>

            <p className={styles.bookingNote}><CreditCard size={13} strokeWidth={2.25} /> Thanh toán an toàn bằng chuyển khoản ngân hàng qua mã QR</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
