import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Calendar, Clock, Trophy,
  AlertTriangle, Info, CheckCircle2, Wallet, ShieldCheck,
} from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import Modal from '@/components/ui/Modal/Modal'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import HoldTimer from '@/components/booking/HoldTimer/HoldTimer'
import TimeSlotPicker from '@/components/venue/TimeSlotPicker/TimeSlotPicker'
import { transferService } from '@/services/transferService'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, formatTime, getNext30Days, toLocalISODate } from '@/utils'
import { buildRescheduleSlots, durationMinutes } from '@/utils/rescheduleSlots'
import styles from './TransferBooking.module.css'

const toISODate = (d) => toLocalISODate(d)

/**
 * Trang ĐỔI LỊCH, ba bước:
 *   1. Xem chính sách phí sẽ áp dụng — cố tình đặt TRƯỚC bước chọn giờ, để khách
 *      biết mình sẽ mất bao nhiêu trước khi mất công chọn.
 *   2. Chọn ngày/giờ (hoặc sân khác) trong CÙNG địa điểm; giữ nguyên độ dài lượt đặt.
 *   3. Xem bảng chi phí do máy chủ tính và xác nhận.
 */
export default function TransferBooking() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [step, setStep] = useState(1)
  const [eligibility, setEligibility] = useState(null)
  const [loading, setLoading] = useState(true)

  // Bước 2 — chọn giờ mới
  const [venue, setVenue] = useState(null)
  const [court, setCourt] = useState(null)
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState(null)                  // một khung cố định độ dài
  const [slotsData, setSlotsData] = useState(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Bước 3 — báo giá
  const [quoting, setQuoting] = useState(false)
  const [quote, setQuote] = useState(null)
  const [confirming, setConfirming] = useState(false)

  // ── Tải điều kiện đổi lịch ───────────────────────────────
  useEffect(() => {
    transferService.getEligibility(bookingId)
      .then((res) => {
        setEligibility(res)
        // Mặc định giữ nguyên ngày cũ — phần lớn khách chỉ đổi giờ
        setDate(res.booking?.date || toISODate(new Date()))
      })
      .catch((err) => {
        toast.error(err?.message || 'Không thể tải thông tin lượt đặt')
        navigate('/bookings')
      })
      .finally(() => setLoading(false))
  }, [bookingId])

  // Mở thẳng địa điểm và sân của lượt đặt hiện tại.
  useEffect(() => {
    const bk = eligibility?.booking
    if (!bk?.venueId) return
    venueService.getVenueById(bk.venueId)
      .then((res) => {
        const full = res.venue
        setVenue(full)
        const active = (full.courts || []).filter((c) => c.status === 'active')
        setCourt(active.find((c) => String(c._id) === String(bk.courtId)) || active[0] || null)
      })
      .catch(() => toast.error('Không thể tải thông tin địa điểm'))
  }, [eligibility])

  // ── Tải khung giờ của sân đã chọn ───────────────────────
  useEffect(() => {
    if (!venue || !court || !date) return
    setLoadingSlots(true)
    setSlot(null)
    venueService.getCourtSlots(venue._id, court._id, date)
      .then((d) => setSlotsData(d))
      .catch(() => setSlotsData({ bookedSlots: [] }))
      .finally(() => setLoadingSlots(false))
  }, [venue, court, date])

  const slots = useMemo(() => {
    if (!venue || !court) return []
    const bk = eligibility?.booking
    if (!bk) return []
    // Giữ nguyên độ dài lượt đặt (lượt 2 giờ → khung 2 giờ), chọn giờ bắt đầu mới.
    const now = new Date()
    return buildRescheduleSlots({
      open: venue.openHours?.open || '06:00',
      close: venue.openHours?.close || '22:00',
      durationMin: durationMinutes(bk.startTime, bk.endTime) || 60,
      date,
      courtId: court._id,
      bookedSlots: slotsData?.bookedSlots || [],
      original: { date: bk.date, courtId: bk.courtId, startTime: bk.startTime, endTime: bk.endTime },
      today: toLocalISODate(),
      nowMinutes: now.getHours() * 60 + now.getMinutes(),
    })
  }, [venue, court, date, slotsData, eligibility])

  // ── Lấy báo giá ─────────────────────────────────────────
  const requestQuote = async () => {
    const chosen = slot
    if (!venue || !court || !chosen) return
    setQuoting(true)
    try {
      const res = await transferService.createQuote(bookingId, {
        toVenueId: venue._id,
        toCourtId: court._id,
        toDate: date,
        toStartTime: chosen.start,
        toEndTime: chosen.end,
      })
      setQuote(res)
      setStep(3)
    } catch (err) {
      toast.error(err?.message || 'Không thể tạo báo giá đổi lịch')
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
        toast.success('Đã gửi yêu cầu, đang chờ chủ sân duyệt')
        navigate(`/transfers/${quote.transfer._id}`)
        return
      }
      toast.success('Đã đổi lịch thành công')
      navigate('/bookings')
    } catch (err) {
      toast.error(err?.message || 'Không thể hoàn tất đổi lịch')
      // Báo giá hết hạn hoặc khung giờ bị mất — quay lại bước chọn giờ
      if ([409, 410].includes(err?.status)) { setQuote(null); setStep(2) }
    } finally {
      setConfirming(false)
    }
  }

  if (loading) return <div className={styles.loading}><Spinner size="lg" /></div>
  if (!eligibility) return null

  const b = eligibility.booking

  // ── Không đủ điều kiện đổi lịch ───────────────────────────
  if (!eligibility.eligible) {
    return (
      <div className={styles.page}>
        <div className="container">
          <Link to="/bookings" className={styles.back}><ArrowLeft size={15} /> Quay lại lịch sử đặt sân</Link>
          <EmptyState
            icon={<AlertTriangle size={48} />}
            title="Lượt đặt này không thể đổi lịch"
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
          <h1 className={styles.title}>Đổi lịch</h1>
          <p className={styles.sub}>Đổi ngày hoặc giờ chơi trong cùng địa điểm thay vì huỷ lượt đặt</p>
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
              <h2 className={styles.cardTitle}>Chi phí nếu đổi lịch bây giờ</h2>
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
              />

              {eligibility.monthly?.limit > 0 && (
                <div className={styles.noteBox}>
                  <Info size={15} />
                  <p>Bạn đã dùng <strong>{eligibility.monthly.used}/{eligibility.monthly.limit}</strong> lượt đổi lịch trong tháng này. Hạn mức mở lại từ đầu tháng sau.</p>
                </div>
              )}

              <div className={styles.noteBox}>
                <Info size={15} />
                <p>
                  Bạn giữ nguyên địa điểm và độ dài lượt đặt, chỉ đổi ngày hoặc giờ (hoặc sang sân khác trong cùng địa điểm).
                  Phí đổi lịch lấy theo bảng trên (thường miễn phí khi còn nhiều thời gian), cộng thêm
                  phần chênh lệch giá nếu giờ mới đắt hơn. Mỗi lượt đặt chỉ được đổi lịch
                  {' '}<strong>{(eligibility.remainingTransfers ?? 1)} lần</strong> nữa.
                </p>
              </div>

              <Button fullWidth iconRight={<ArrowRight size={16} />} onClick={() => setStep(2)}>
                Chọn giờ mới
              </Button>
            </div>
          </div>
        )}

        {/* ══════════ BƯỚC 2 — CHỌN GIỜ MỚI ══════════ */}
        {step === 2 && (
          <div className={styles.gridSingle}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Chọn ngày và giờ mới</h2>

              {!venue ? (
                <div className={styles.loadingInline}><Spinner /></div>
              ) : (
                <>
                  <div className={styles.noteBox}>
                    <Info size={15} />
                    <p>
                      Lịch hiện tại: <strong>{formatDate(b.date)} · {formatTime(b.startTime)}–{formatTime(b.endTime)}</strong> tại {b.venueName}.
                      {' '}Giờ mới giữ nguyên độ dài {Math.round((durationMinutes(b.startTime, b.endTime) / 60) * 10) / 10} giờ.
                    </p>
                  </div>
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
                      {slot && (
                        <p className={styles.slotSummary}>
                          Lịch mới: <strong>{formatDate(date)} · {formatTime(slot.start)}–{formatTime(slot.end)}</strong>
                        </p>
                      )}
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
                  Xem chi phí đổi lịch
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
  const steps = ['Chi phí', 'Chọn giờ mới', 'Xác nhận']
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

/** Bảng biểu phí đổi lịch, tô đậm bậc đang áp dụng cho khách. */
function PolicyTable({ leadHours, feeTiers }) {
  const sorted = [...feeTiers].sort((a, b) => b.minLeadHours - a.minLeadHours)
  const activeIndex = sorted.findIndex((t) => leadHours >= t.minLeadHours)

  return (
    <div className={styles.policyTable}>
      <div className={styles.policyHead}>
        <span>Thời gian còn lại</span>
        <span>Phí đổi lịch</span>
      </div>
      {sorted.map((t, i) => (
        <div key={t.minLeadHours} className={`${styles.policyRow} ${i === activeIndex ? styles.policyRowActive : ''}`}>
          <span>{t.minLeadHours > 0 ? `Từ ${t.minLeadHours} giờ` : 'Dưới ngưỡng trên'}</span>
          <span>{pct(t.sameVenueRate)}</span>
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
          <h2 className={styles.cardTitle}>Xác nhận đổi lịch</h2>
          <HoldTimer expiresAt={transfer.quoteExpiresAt} onExpire={onExpire} />
        </div>

        <div className={styles.routeBox}>
          <div className={styles.routeSide}>
            <span className={styles.routeTag}>Lịch hiện tại</span>
            <p className={styles.routeVenue}>{transfer.fromVenueName}</p>
            <p className={styles.routeCourt}>{transfer.fromCourtName}</p>
            <p className={styles.routeTime}>{formatDate(transfer.fromDate)} · {formatTime(transfer.fromStartTime)}–{formatTime(transfer.fromEndTime)}</p>
          </div>
          <ArrowRight size={20} className={styles.routeArrow} />
          <div className={styles.routeSide}>
            <span className={`${styles.routeTag} ${styles.routeTagTo}`}>Lịch mới</span>
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
            <p>Chủ sân yêu cầu duyệt thủ công. Yêu cầu của bạn sẽ được gửi đi và chờ họ phản hồi.</p>
          </div>
        )}

        <div className={styles.safeBox}>
          <ShieldCheck size={15} />
          <p>Nếu đổi lịch không thành công vì bất kỳ lý do gì, lượt đặt hiện tại của bạn <strong>vẫn còn nguyên hiệu lực</strong> và mọi khoản đã thu thêm được hoàn lại đầy đủ.</p>
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
            {needPay ? `Tiếp tục — ${formatCurrency(q.settlement)}` : 'Xác nhận đổi lịch'}
          </Button>
        </div>
      </div>
    </div>
  )
}
