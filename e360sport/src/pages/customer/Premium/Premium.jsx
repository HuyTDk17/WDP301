import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Crown, Check, Copy, Hourglass, AlertTriangle, Sparkles } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import PremiumBadge from '@/components/common/PremiumBadge/PremiumBadge'
import { premiumService, PREMIUM_PLAN_NAME, PREMIUM_STATUS } from '@/services/premiumService'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/utils'
import styles from './Premium.module.css'

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—')

function CopyRow({ label, value, copyValue }) {
  const [done, setDone] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(String(copyValue ?? value)).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {})
  }
  return (
    <div className={styles.copyRow}>
      <span>{label}</span>
      <strong>{value}<button type="button" className={styles.copyBtn} onClick={copy} aria-label={`Sao chép ${label}`}>{done ? <Check size={14} /> : <Copy size={14} />}</button></strong>
    </div>
  )
}

/**
 * Trang GÓI PREMIUM — dùng chung cho người chơi (/premium) và chủ sân (/owner/premium).
 * Chọn gói theo vai trò → hiện mã QR chuyển khoản vào tài khoản nền tảng → hệ thống tự xác nhận
 * (nếu đã bật webhook) hoặc admin đối chiếu. Còn hạn thì mua tiếp sẽ cộng nối vào ngày hết hạn.
 */
export default function Premium({ embedded = false }) {
  const { user, isAuthenticated, refreshUser } = useAuth()
  const { toast } = useToast()
  const [plans, setPlans] = useState(null)
  const [mine, setMine] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const p = await premiumService.getPlans()
      setPlans(p)
      if (isAuthenticated && user?.role !== 'admin') setMine(await premiumService.getMine())
    } catch { toast.error('Không thể tải thông tin gói Premium') } finally { setLoading(false) }
  }, [isAuthenticated, user?.role])
  useEffect(() => { load() }, [load])

  // Đơn đang chờ tiền: hỏi lại máy chủ mỗi 15 giây để trang tự cập nhật khi đã nhận tiền
  const open = mine?.open
  useEffect(() => {
    if (!open) return undefined
    const t = setInterval(async () => {
      try {
        const m = await premiumService.getMine()
        setMine(m)
        if (!m.open && m.active) { toast.success('Gói Premium đã được kích hoạt!'); refreshUser?.() }
      } catch { /* bỏ qua lỗi mạng thoáng qua */ }
    }, 15000)
    return () => clearInterval(t)
  }, [open?._id])

  const act = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); if (okMsg) toast.success(okMsg); await load() } catch (err) { toast.error(err?.message || 'Có lỗi xảy ra') } finally { setBusy(false) }
  }

  if (loading) return <div className={styles.loading}><Spinner size="lg" /></div>
  if (!plans) return null

  const role = user?.role
  const myPlanId = isAuthenticated ? mine?.planId : null
  const wrapperClass = embedded ? styles.embedded : `container ${styles.page}`

  return (
    <div className={wrapperClass}>
      <section className={styles.hero}>
        <span className={styles.heroIcon}><Crown size={28} /></span>
        <h1 className={styles.title}>Nâng cấp lên Premium</h1>
        <p className={styles.sub}>{plans.durationDays} ngày cho mỗi lần mua · thanh toán bằng chuyển khoản, kích hoạt tự động khi tiền về</p>
      </section>

      {mine?.active && (
        <div className={styles.status}>
          <PremiumBadge size="md" label={PREMIUM_PLAN_NAME[mine.plan]} />
          <span>Còn <strong>{mine.daysLeft} ngày</strong> · hết hạn <strong>{fmtDate(mine.until)}</strong>. Gia hạn bất cứ lúc nào — thời gian được cộng nối tiếp, không mất ngày nào.</span>
        </div>
      )}

      {plans.enabled === false && <div className={`${styles.alert} ${styles.alertWarn}`}><AlertTriangle size={16} /><span>Gói Premium hiện tạm ngừng bán.</span></div>}

      <div className={styles.grid}>
        {plans.plans.map((p) => {
          const mineCard = myPlanId === p.id
          const wrongRole = isAuthenticated && role !== 'admin' && !mineCard
          return (
            <article key={p.id} className={`${styles.card} ${mineCard ? styles.cardMine : ''}`}>
              {p.id === 'venue_premium' && <span className={styles.ribbon}><Sparkles size={12} /> Dành cho chủ sân</span>}
              {p.id === 'player_premium' && <span className={styles.ribbon}><Sparkles size={12} /> Dành cho người chơi</span>}
              <h2 className={styles.planName}>{p.name}</h2>
              <p className={styles.tagline}>{p.tagline}</p>
              <p className={styles.price}>{formatCurrency(p.price)}<small> / {p.durationDays} ngày</small></p>
              <ul className={styles.perks}>
                {p.perks.map((k) => (
                  <li key={k.title}><span className={styles.perkIcon}>{k.icon}</span><div><strong>{k.title}</strong><p>{k.text}</p></div></li>
                ))}
              </ul>
              {!isAuthenticated && <Link to="/login" className={styles.ctaLink}>Đăng nhập để mua</Link>}
              {isAuthenticated && role === 'admin' && <p className={styles.note}>Tài khoản quản trị không mua gói.</p>}
              {wrongRole && <p className={styles.note}>{p.audience === 'owner' ? 'Gói này dành cho tài khoản chủ sân.' : 'Gói này dành cho tài khoản người chơi.'}</p>}
              {mineCard && !open && plans.enabled !== false && (
                <Button loading={busy} onClick={() => act(premiumService.createOrder)}>{mine?.active ? 'Gia hạn thêm' : 'Mua gói này'}</Button>
              )}
              {mineCard && open && <p className={styles.note}>Bạn đang có một đơn chờ thanh toán — xem bên dưới.</p>}
            </article>
          )
        })}
      </div>

      {open && (
        <section className={styles.payCard}>
          <div className={styles.payHead}>
            <h3>Thanh toán đơn {open.code}</h3>
            <Badge size="sm" style={{ background: PREMIUM_STATUS[open.status].bg, color: PREMIUM_STATUS[open.status].color }}>{PREMIUM_STATUS[open.status].label}</Badge>
          </div>
          {open.payInfo && (
            <div className={styles.payBox}>
              {open.payInfo.qrUrl && <img className={styles.qr} src={open.payInfo.qrUrl} alt="Mã QR chuyển khoản gói Premium" />}
              <div className={styles.payRows}>
                <CopyRow label="Ngân hàng" value={open.payInfo.bankName || '—'} />
                <CopyRow label="Số tài khoản" value={open.payInfo.accountNumber} />
                <CopyRow label="Chủ tài khoản" value={open.payInfo.accountName || '—'} />
                <CopyRow label="Số tiền" value={formatCurrency(open.amount)} copyValue={open.amount} />
                <CopyRow label="Nội dung" value={open.code} />
              </div>
            </div>
          )}
          <div className={`${styles.alert} ${styles.alertWarn}`}><AlertTriangle size={16} /><span>Chuyển <strong>đúng số tiền và đúng nội dung</strong> để hệ thống nhận diện. Chỉ chuyển một lần.</span></div>
          {open.status === 'pending' && (
            <div className={styles.actions}>
              {mine.autoConfirm
                ? <div className={`${styles.alert} ${styles.alertInfo}`}><Hourglass size={16} /><span>Sau khi chuyển, hệ thống <strong>tự kích hoạt</strong> trong vài phút và trang này tự cập nhật.</span></div>
                : <Button loading={busy} onClick={() => act(() => premiumService.reportPaid(open._id), 'Đã ghi nhận — quản trị viên sẽ đối chiếu và kích hoạt sớm')}>Tôi đã chuyển khoản</Button>}
              <Button variant="outline" disabled={busy} onClick={() => act(() => premiumService.cancelOrder(open._id), 'Đã huỷ đơn')}>Huỷ đơn</Button>
            </div>
          )}
          {open.status === 'reported' && (
            <div className={`${styles.alert} ${styles.alertInfo}`}><Hourglass size={16} /><span>Bạn đã báo chuyển khoản. Quản trị viên đang đối chiếu — bạn <strong>không cần chuyển lại</strong>.</span></div>
          )}
        </section>
      )}

      {mine?.history?.length > 0 && (
        <section className={styles.history}>
          <h3>Lịch sử mua gói</h3>
          {mine.history.map((o) => (
            <div key={o._id} className={styles.histRow}>
              <div><strong>{PREMIUM_PLAN_NAME[o.plan]}</strong><span className={styles.histMeta}>{o.code} · {fmtDate(o.paidAt || o.createdAt)}{o.status === 'paid' ? ` · hạn đến ${fmtDate(o.endsAt)}` : ''}</span></div>
              <div className={styles.histRight}>
                <strong>{formatCurrency(o.amount)}</strong>
                <Badge size="sm" style={{ background: PREMIUM_STATUS[o.status].bg, color: PREMIUM_STATUS[o.status].color }}>{PREMIUM_STATUS[o.status].label}</Badge>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
