import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Calendar, Clock, MapPin, Search, Trophy,
  AlertTriangle, Info, CheckCircle2, Wallet, ShieldCheck,
} from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Input from '@/components/ui/Input/Input'
import Spinner from '@/components/ui/Spinner/Spinner'
import Modal from '@/components/ui/Modal/Modal'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import HoldTimer from '@/components/booking/HoldTimer/HoldTimer'
import TimeSlotPicker from '@/components/venue/TimeSlotPicker/TimeSlotPicker'
import { transferService } from '@/services/transferService'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import { useDebounce } from '@/hooks'
import { formatCurrency, formatDate, formatTime, buildAvailableSlots, getNext30Days, toLocalISODate } from '@/utils'
import styles from './TransferBooking.module.css'

const toISODate = (d) => toLocalISODate(d)

/**
 * Trang CHUYỂN SÂN, ba bước:
 *   1. Xem chính sách phí sẽ áp dụng — cố tình đặt TRƯỚC bước tìm sân, để khách
 *      biết mình sẽ mất bao nhiêu trước khi mất công chọn sân mới.
 *   2. Tìm và chọn sân/khung giờ đích.
 *   3. Xem bảng chi phí do máy chủ tính và xác nhận.
 */
export default function TransferBooking() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [step, setStep] = useState(1)
  const [eligibility, setEligibility] = useState(null)
  const [loading, setLoading] = useState(true)

  // Bước 2 — tìm sân
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const debouncedSearch = useDebounce(search, 400)
  const [venues, setVenues] = useState([])
  const [searching, setSearching] = useState(false)
  const [venue, setVenue] = useState(null)
  const [court, setCourt] = useState(null)
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState(null)
  const [slotsData, setSlotsData] = useState(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Bước 3 — báo giá
  const [quoting, setQuoting] = useState(false)
  const [quote, setQuote] = useState(null)
  const [confirming, setConfirming] = useState(false)

  // ── Tải điều kiện chuyển ────────────────────────────────
  useEffect(() => {
    transferService.getEligibility(bookingId)
      .then((res) => {
        setEligibility(res)
        // Mặc định giữ nguyên ngày cũ — phần lớn khách chỉ đổi địa điểm
        setDate(res.booking?.date || toISODate(new Date()))
      })
      .catch((err) => {
        toast.error(err?.message || 'Không thể tải thông tin lượt đặt')
        navigate('/bookings')
      })
      .finally(() => setLoading(false))
  }, [bookingId])

  // ── Tìm địa điểm ────────────────────────────────────────
  const loadVenues = useCallback(() => {
    setSearching(true)
    venueService.getVenues({
      search: debouncedSearch || undefined,
      city: city || undefined,
      sport: eligibility?.booking?.sport || undefined,
      limit: 12,
    })
      .then((res) => setVenues(res.venues || []))
      .catch(() => toast.error('Không thể tải danh sách địa điểm'))
      .finally(() => setSearching(false))
  }, [debouncedSearch, city, eligibility])

  useEffect(() => { if (step === 2) loadVenues() }, [step, loadVenues])

  // ── Tải khung giờ của sân đã chọn ───────────────────────
  useEffect(() => {
    if (!venue || !court || !date) return
    setLoadingSlots(true)
    setSlot(null)
    venueService.getCourtSlots(venue._id, court._id, date)
      .then(setSlotsData)
      .catch(() => setSlotsData({ bookedSlots: [] }))
      .finally(() => setLoadingSlots(false))
  }, [venue, court, date])

  const slots = useMemo(() => {
    if (!venue || !court) return []
    return buildAvailableSlots(
      venue.openHours?.open || '06:00',
      venue.openHours?.close || '22:00',
      60, date, slotsData?.bookedSlots || []
    )
  }, [venue, court, date, slotsData])

  const selectVenue = async (v) => {
    try {
      const res = await venueService.getVenueById(v._id)
      const full = res.venue
      setVenue(full)
      // Tự chọn sân đầu tiên đang hoạt động cho đỡ một bước bấm
      const activeCourts = (full.courts || []).filter((c) => c.status === 'active')
      setCourt(activeCourts[0] || null)
    } catch {
      toast.error('Không thể tải chi tiết địa điểm')
    }
  }

  // ── Lấy báo giá ─────────────────────────────────────────
  const requestQuote = async () => {
    if (!venue || !court || !slot) return
    setQuoting(true)
    try {
      const res = await transferService.createQuote(bookingId, {
        toVenueId: venue._id,
        toCourtId: court._id,
        toDate: date,
        toStartTime: slot.start,
        toEndTime: slot.end,
      })
      setQuote(res)
      setStep(3)
    } catch (err) {
      toast.error(err?.message || 'Không thể tạo báo giá chuyển sân')
    } finally {
      setQuoting(false)
    }
  }

  // ── Xác nhận ────────────────────────────────────────────
  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const res = await transferService.confirm(quote.transfer._id)
      // Cần thu thêm tiền: không còn "trang thanh toán" của cổng để redirect
      // tới nữa — chuyển sang trang chi tiết yêu cầu, nơi hiển thị hướng dẫn
      // chuyển khoản + mã QR (xem TransferDetail.jsx).
      if (res.status === 'awaiting_payment') {
        navigate(`/transfers/${quote.transfer._id}`)
        return
      }
      if (res.status === 'awaiting_owner_approval') {
        toast.success('Đã gửi yêu cầu, đang chờ chủ sân đích duyệt')
        navigate(`/transfers/${quote.transfer._id}`)
        return
      }
      toast.success('Đã chuyển sân thành công')
      navigate('/bookings')
    } catch (err) {
      toast.error(err?.message || 'Không thể hoàn tất chuyển sân')
      // Báo giá hết hạn hoặc khung giờ bị mất — quay lại bước chọn sân
      if ([409, 410].includes(err?.status)) { setQuote(null); setStep(2) }
    } finally {
      setConfirming(false)
    }
  }

  if (loading) return <div className={styles.loading}><Spinner size="lg" /></div>
  if (!eligibility) return null

  const b = eligibility.booking

  // ── Không đủ điều kiện chuyển ───────────────────────────
  if (!eligibility.eligible) {
    return (
      <div className={styles.page}>
        <div className="container">
          <Link to="/bookings" className={styles.back}><ArrowLeft size={15} /> Quay lại lịch sử đặt sân</Link>
          <EmptyState
            icon={<AlertTriangle size={48} />}
            title="Lượt đặt này không thể chuyển"
            description={eligibility.reasons.join('. ')}
            action={() => navigate('/bookings')}
            actionLabel="Về lịch sử đặt sân"
          />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <Link to="/bookings" className={styles.back}><ArrowLeft size={15} /> Quay lại lịch sử đặt sân</Link>

        <div className={styles.header}>
          <h1 className={styles.title}>Chuyển sân</h1>
          <p className={styles.sub}>Đổi sang sân hoặc địa điểm khác thay vì huỷ lượt đặt</p>
        </div>

        <Stepper step={step} />

        {/* ══════════ BƯỚC 1 — CHÍNH SÁCH ══════════ */}
        {step === 1 && (
          <div className={styles.grid}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Lượt đặt hiện tại</h2>
              <div className={styles.currentBooking}>
                <p className={styles.venueName}>{b.venueName}</p>
                <p className={styles.courtName}><Trophy size={13} /> {b.courtName}</p>
                <div className={styles.metaRow}>
                  <span><Calendar size={13} /> {formatDate(b.date)}</span>
                  <span><Clock size={13} /> {formatTime(b.startTime)} – {formatTime(b.endTime)}</span>
                </div>
                <div className={styles.paidBox}>
                  <span>Đã thanh toán</span>
                  <strong>{formatCurrency(b.paid)}</strong>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Chi phí nếu chuyển bây giờ</h2>
              <div className={styles.leadBox}>
                <Clock size={18} />
                <div>
                  <p className={styles.leadValue}>Còn {formatLead(eligibility.leadTimeHours)}</p>
                  <p className={styles.leadNote}>tính đến giờ bắt đầu</p>
                </div>
              </div>

              <PolicyTable
                leadHours={eligibility.leadTimeHours}
                feeTiers={eligibility.feePolicy?.transferFeeTiers || []}
                compTiers={eligibility.feePolicy?.compensationTiers || []}
              />

              <div className={styles.noteBox}>
                <Info size={15} />
                <p>
                  Phí chuyển tính trên giá sân của lượt đặt hiện tại. Nếu chuyển sang địa điểm của chủ sân
                  khác và sát giờ, bạn còn phải trả thêm khoản bồi thường cho chủ sân cũ vì họ không kịp
                  bán lại khung giờ. Đổi giờ hoặc đổi sân trong cùng địa điểm thường <strong>miễn phí</strong>.
                </p>
              </div>

              <Button fullWidth iconRight={<ArrowRight size={16} />} onClick={() => setStep(2)}>
                Tìm sân mới
              </Button>
            </div>
          </div>
        )}

        {/* ══════════ BƯỚC 2 — CHỌN SÂN ĐÍCH ══════════ */}
        {step === 2 && (
          <div className={styles.grid2}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Chọn địa điểm mới</h2>
              <div className={styles.filters}>
                <Input
                  placeholder="Tìm theo tên địa điểm..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  icon={<Search size={15} />}
                />
                <Input
                  placeholder="Quận / Thành phố"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  icon={<MapPin size={15} />}
                />
              </div>

              {searching ? (
                <div className={styles.loadingInline}><Spinner /></div>
              ) : venues.length === 0 ? (
                <p className={styles.emptyText}>Không tìm thấy địa điểm phù hợp</p>
              ) : (
                <div className={styles.venueList}>
                  {venues.map((v) => (
                    <button
                      key={v._id}
                      className={`${styles.venueItem} ${venue?._id === v._id ? styles.venueItemActive : ''}`}
                      onClick={() => selectVenue(v)}
                    >
                      <div>
                        <p className={styles.venueItemName}>{v.name}</p>
                        <p className={styles.venueItemAddr}>
                          <MapPin size={11} /> {[v.address?.district, v.address?.city].filter(Boolean).join(', ') || 'Chưa có địa chỉ'}
                        </p>
                      </div>
                      <span className={styles.venueItemPrice}>
                        {v.minPricePerHour ? `từ ${formatCurrency(v.minPricePerHour)}` : '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Chọn sân và khung giờ</h2>

              {!venue ? (
                <p className={styles.emptyText}>Chọn một địa điểm ở bên trái để xem khung giờ trống</p>
              ) : (
                <>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Sân</label>
                    <div className={styles.chips}>
                      {(venue.courts || []).filter((c) => c.status === 'active').map((c) => (
                        <button
                          key={c._id}
                          className={`${styles.chip} ${court?._id === c._id ? styles.chipActive : ''}`}
                          onClick={() => setCourt(c)}
                        >
                          {c.name}
                          <span className={styles.chipPrice}>{formatCurrency(c.pricePerHour)}/giờ</span>
                        </button>
                      ))}
                      {(venue.courts || []).filter((c) => c.status === 'active').length === 0 && (
                        <p className={styles.emptyText}>Địa điểm này chưa có sân nào đang hoạt động</p>
                      )}
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Ngày</label>
                    <div className={styles.dateScroll}>
                      {getNext30Days().slice(0, 14).map((d) => {
                        const iso = toISODate(d)
                        return (
                          <button
                            key={iso}
                            className={`${styles.dateChip} ${date === iso ? styles.dateChipActive : ''}`}
                            onClick={() => setDate(iso)}
                          >
                            <span className={styles.dateDow}>{['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]}</span>
                            <span className={styles.dateNum}>{d.getDate()}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {court && (
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>Khung giờ</label>
                      <TimeSlotPicker
                        slots={slots}
                        selected={slot ? [slot] : []}
                        onToggle={(s) => setSlot(slot?.start === s.start ? null : s)}
                        loading={loadingSlots}
                        maxSlots={1}
                      />
                    </div>
                  )}
                </>
              )}

              <div className={styles.actions}>
                <Button variant="outline" onClick={() => setStep(1)} icon={<ArrowLeft size={15} />}>Quay lại</Button>
                <Button
                  disabled={!venue || !court || !slot}
                  loading={quoting}
                  onClick={requestQuote}
                  iconRight={<ArrowRight size={16} />}
                >
                  Xem chi phí chuyển
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ BƯỚC 3 — BẢNG CHI PHÍ ══════════ */}
        {step === 3 && quote && (
          <QuoteConfirm
            quote={quote}
            confirming={confirming}
            onBack={() => { setQuote(null); setStep(2) }}
            onConfirm={handleConfirm}
            onExpire={() => {
              toast.error('Báo giá đã hết hạn, vui lòng chọn lại khung giờ')
              setQuote(null); setStep(2)
            }}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
// THÀNH PHẦN PHỤ
// ============================================================

function Stepper({ step }) {
  const steps = ['Chính sách phí', 'Chọn sân mới', 'Xác nhận']
  return (
    <div className={styles.stepper}>
      {steps.map((label, i) => (
        <div key={label} className={`${styles.stepItem} ${step === i + 1 ? styles.stepActive : ''} ${step > i + 1 ? styles.stepDone : ''}`}>
          <span className={styles.stepNum}>{step > i + 1 ? <CheckCircle2 size={14} /> : i + 1}</span>
          <span className={styles.stepLabel}>{label}</span>
        </div>
      ))}
    </div>
  )
}

const formatLead = (hours) => {
  if (hours >= 24) return `${Math.floor(hours / 24)} ngày ${Math.round(hours % 24)} giờ`
  if (hours >= 1) return `${Math.floor(hours)} giờ ${Math.round((hours % 1) * 60)} phút`
  return `${Math.round(hours * 60)} phút`
}

/** Bảng biểu phí, tô đậm bậc đang áp dụng cho khách. */
function PolicyTable({ leadHours, feeTiers, compTiers }) {
  const sorted = [...feeTiers].sort((a, b) => b.minLeadHours - a.minLeadHours)
  const activeIndex = sorted.findIndex((t) => leadHours >= t.minLeadHours)
  const compByLead = (min) => {
    const t = [...compTiers].sort((a, b) => b.minLeadHours - a.minLeadHours).find((x) => min >= x.minLeadHours)
    return t ? t.rate : 0
  }

  return (
    <div className={styles.policyTable}>
      <div className={styles.policyHead}>
        <span>Thời gian còn lại</span>
        <span>Cùng địa điểm</span>
        <span>Khác địa điểm</span>
        <span>Bồi thường</span>
      </div>
      {sorted.map((t, i) => (
        <div key={t.minLeadHours} className={`${styles.policyRow} ${i === activeIndex ? styles.policyRowActive : ''}`}>
          <span>{t.minLeadHours > 0 ? `Từ ${t.minLeadHours} giờ` : 'Dưới ngưỡng trên'}</span>
          <span>{pct(t.sameVenueRate)}</span>
          <span>{pct(t.crossOwnerRate)}</span>
          <span>{pct(compByLead(t.minLeadHours))}</span>
        </div>
      ))}
    </div>
  )
}

const pct = (r) => (r > 0 ? `${Math.round(r * 100)}%` : 'Miễn phí')

/** Bảng chi phí cuối cùng. Mọi con số do máy chủ tính, ở đây chỉ vẽ lại. */
function QuoteConfirm({ quote, confirming, onBack, onConfirm, onExpire }) {
  const { transfer, breakdown, requiresApproval } = quote
  const q = transfer.quote
  const needPay = q.settlement > 0

  return (
    <div className={styles.confirmWrap}>
      <div className={styles.card}>
        <div className={styles.confirmHead}>
          <h2 className={styles.cardTitle}>Xác nhận chuyển sân</h2>
          <HoldTimer expiresAt={transfer.quoteExpiresAt} onExpire={onExpire} />
        </div>

        <div className={styles.routeBox}>
          <div className={styles.routeSide}>
            <span className={styles.routeTag}>Từ</span>
            <p className={styles.routeVenue}>{transfer.fromVenueName}</p>
            <p className={styles.routeCourt}>{transfer.fromCourtName}</p>
            <p className={styles.routeTime}>{formatDate(transfer.fromDate)} · {formatTime(transfer.fromStartTime)}–{formatTime(transfer.fromEndTime)}</p>
          </div>
          <ArrowRight size={20} className={styles.routeArrow} />
          <div className={styles.routeSide}>
            <span className={`${styles.routeTag} ${styles.routeTagTo}`}>Đến</span>
            <p className={styles.routeVenue}>{transfer.toVenueName}</p>
            <p className={styles.routeCourt}>{transfer.toCourtName}</p>
            <p className={styles.routeTime}>{formatDate(transfer.toDate)} · {formatTime(transfer.toStartTime)}–{formatTime(transfer.toEndTime)}</p>
          </div>
        </div>

        <div className={styles.breakdown}>
          {breakdown.map((row, i) => (
            <div key={i} className={`${styles.breakRow} ${row.emphasis ? styles.breakRowTotal : ''}`}>
              <span>{row.label}</span>
              <strong className={row.amount < 0 ? styles.negative : ''}>
                {row.amount < 0 ? `− ${formatCurrency(-row.amount)}` : formatCurrency(row.amount)}
              </strong>
            </div>
          ))}
        </div>

        {q.refundCredit > 0 && (
          <div className={styles.noteBox}>
            <Wallet size={15} />
            <p>
              Trong đó <strong>{formatCurrency(q.refundCash)}</strong> được hoàn về phương thức thanh toán
              và <strong>{formatCurrency(q.refundCredit)}</strong> được cộng vào số dư khuyến mãi của tài khoản,
              dùng để trừ cho các lần đặt sân sau.
            </p>
          </div>
        )}

        {requiresApproval && (
          <div className={styles.warnBox}>
            <ShieldCheck size={15} />
            <p>Chủ sân đích yêu cầu duyệt thủ công. Yêu cầu của bạn sẽ được gửi đi và chờ họ phản hồi.</p>
          </div>
        )}

        <div className={styles.safeBox}>
          <ShieldCheck size={15} />
          <p>Nếu chuyển không thành công vì bất kỳ lý do gì, lượt đặt hiện tại của bạn <strong>vẫn còn nguyên hiệu lực</strong> và mọi khoản đã thu thêm được hoàn lại đầy đủ.</p>
        </div>

        {needPay && (
          <div className={styles.warnBox}>
            <Wallet size={15} />
            <p>
              Bước kế tiếp sẽ hiển thị số tài khoản và mã QR để bạn chuyển khoản khoản chênh lệch.
              Lượt đặt hiện tại vẫn được giữ nguyên trong lúc chờ xác nhận.
            </p>
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="outline" onClick={onBack} icon={<ArrowLeft size={15} />}>Chọn lại</Button>
          <Button loading={confirming} onClick={onConfirm}>
            {needPay ? `Tiếp tục — ${formatCurrency(q.settlement)}` : 'Xác nhận chuyển sân'}
          </Button>
        </div>
      </div>
    </div>
  )
}
