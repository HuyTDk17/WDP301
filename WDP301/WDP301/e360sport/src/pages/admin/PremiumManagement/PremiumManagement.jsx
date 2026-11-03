import { useState, useEffect, useCallback } from 'react'
import { Crown, Wallet, Users, Hourglass, Check, X } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import { premiumService, PREMIUM_PLAN_NAME, PREMIUM_STATUS } from '@/services/premiumService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/utils'
import styles from './PremiumManagement.module.css'

const TABS = [
  { key: 'reported', label: 'Chờ đối chiếu' },
  { key: 'pending', label: 'Chờ chuyển khoản' },
  { key: 'paid', label: 'Đã thanh toán' },
  { key: '', label: 'Tất cả' },
]
const fmt = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—')

/**
 * Doanh thu & đơn mua gói Premium. Tiền gói vào tài khoản NỀN TẢNG, nên admin đối chiếu sao kê và
 * xác nhận ở đây (hoặc để webhook ngân hàng tự xác nhận). Giá, thời hạn và ưu đãi chỉnh ở Cài đặt.
 */
export default function PremiumManagement() {
  const { toast } = useToast()
  const [tab, setTab] = useState('reported')
  const [stats, setStats] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [acting, setActing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      premiumService.adminStats().then(setStats),
      premiumService.adminOrders({ status: tab || undefined, limit: 100 }).then((r) => setOrders(r.orders || [])),
    ]).catch(() => toast.error('Không thể tải dữ liệu Premium')).finally(() => setLoading(false))
  }, [tab])
  useEffect(() => { load() }, [load])

  const doConfirm = async () => {
    setActing(true)
    try { await premiumService.adminConfirm(confirming._id); toast.success('Đã xác nhận — gói Premium đã được kích hoạt'); setConfirming(null); load() }
    catch (err) { toast.error(err?.message || 'Không thể xác nhận') } finally { setActing(false) }
  }
  const doReject = async (reason) => {
    try { await premiumService.adminReject(rejecting._id, reason); toast.success('Đã từ chối đơn'); setRejecting(null); load() }
    catch (err) { toast.error(err?.message || 'Không thể từ chối') }
  }

  const columns = [
    { header: 'Mã đơn', accessor: 'code' },
    { header: 'Người mua', accessor: 'payerName', render: (v, r) => <div><strong>{v || '—'}</strong>{r.venueName && <span className={styles.meta}>{r.venueName}{r.area ? ` · ${r.area}` : ''}</span>}</div> },
    { header: 'Gói', accessor: 'plan', render: (v) => PREMIUM_PLAN_NAME[v] },
    { header: 'Số tiền', accessor: 'amount', render: (v) => <strong>{formatCurrency(v)}</strong> },
    { header: 'Thanh toán', accessor: 'paidAt', render: (v, r) => fmt(v || r.createdAt) },
    { header: 'Hạn gói', accessor: 'endsAt', render: (v) => fmt(v) },
    { header: 'Trạng thái', accessor: 'status', render: (v, r) => (
      <Badge size="sm" style={{ background: PREMIUM_STATUS[v].bg, color: PREMIUM_STATUS[v].color }}>
        {PREMIUM_STATUS[v].label}{v === 'paid' && r.autoConfirmed ? ' · tự động' : ''}
      </Badge>
    ) },
    { header: '', accessor: '_id', render: (_, r) => (['reported', 'pending'].includes(r.status) ? (
      <div className={styles.rowActions}>
        <Button size="sm" onClick={() => setConfirming(r)}><Check size={14} /> Xác nhận</Button>
        <Button size="sm" variant="outline" onClick={() => setRejecting(r)}><X size={14} /> Từ chối</Button>
      </div>
    ) : null) },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Gói Premium" subtitle="Doanh thu và đơn mua gói Venue Premium / Premium Player — chỉnh giá và ưu đãi ở mục Cài đặt" />
      {stats && (
        <div className={styles.statsRow}>
          <StatCard icon={<Wallet size={18} />} label="Doanh thu Premium" value={formatCurrency(stats.revenue)} color="success" />
          <StatCard icon={<Crown size={18} />} label={`Đơn đã thanh toán (${formatCurrency(stats.byPlan.venue_premium.revenue)} chủ sân · ${formatCurrency(stats.byPlan.player_premium.revenue)} người chơi)`} value={stats.orders.toLocaleString()} color="warning" />
          <StatCard icon={<Users size={18} />} label="Đang hiệu lực (chủ sân / người chơi)" value={`${stats.active.venue_premium} / ${stats.active.player_premium}`} color="primary" />
          <StatCard icon={<Hourglass size={18} />} label="Chờ đối chiếu" value={stats.pendingReview} color="secondary" />
        </div>
      )}
      {stats?.byMonth?.length > 0 && (
        <div className={styles.monthly}>
          <h3>Doanh thu theo tháng</h3>
          {stats.byMonth.map((m) => <div key={m.month} className={styles.monthRow}><span>{m.month}</span><strong>{formatCurrency(m.amount)}</strong></div>)}
        </div>
      )}
      <div className={styles.tabs}>
        {TABS.map((t) => <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      <DataTable columns={columns} data={orders} loading={loading} pageSize={10} searchPlaceholder="Tìm theo mã, tên, email…" emptyText="Chưa có đơn nào" />

      <ConfirmModal isOpen={!!confirming} onClose={() => setConfirming(null)} onConfirm={doConfirm} loading={acting} variant="primary"
        title="Xác nhận đã nhận tiền" confirmLabel="Xác nhận & kích hoạt"
        message={confirming ? `Bạn đã thấy ${formatCurrency(confirming.amount)} với nội dung ${confirming.code} trong sao kê? Gói ${PREMIUM_PLAN_NAME[confirming.plan]} sẽ được kích hoạt cho ${confirming.payerName || 'người mua'}.` : ''} />
      <ReasonModal isOpen={!!rejecting} onClose={() => setRejecting(null)} onConfirm={doReject}
        title="Từ chối đơn Premium" description="Người mua sẽ nhận thông báo kèm lý do này." confirmLabel="Từ chối" reasonPlaceholder="VD: Không thấy khoản chuyển khớp mã đơn" />
    </div>
  )
}
