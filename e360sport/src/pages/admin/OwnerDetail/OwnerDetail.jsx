import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, LandPlot, Trophy, ClipboardList, Wallet, Star, Mail, Phone, Building2, MapPin, CheckCircle2, XCircle, Banknote, AlertTriangle, ShieldCheck } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import Spinner from '@/components/ui/Spinner/Spinner'
import Button from '@/components/ui/Button/Button'
import { userService } from '@/services/notificationService'
import { settlementService, SETTLEMENT_STATUS } from '@/services/settlementService'
import Badge from '@/components/ui/Badge/Badge'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, getImageUrl } from '@/utils'
import styles from './OwnerDetail.module.css'

const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=100&h=100&fit=crop'

export default function OwnerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [payoutData, setPayoutData] = useState(null)
  const [issuing, setIssuing] = useState(false)

  // Số dư đối soát + hoá đơn hoa hồng của chủ sân này
  const loadPayouts = () => {
    settlementService.getOwnerSettlements(id).then(setPayoutData).catch(() => {})
  }

  useEffect(() => {
    setLoading(true)
    userService.getOwnerDetail(id)
      .then(setData)
      .catch(() => { toast.error('Không thể tải thông tin chủ sân'); navigate('/admin/owners') })
      .finally(() => setLoading(false))
    loadPayouts()
  }, [id])

  const handleIssue = async () => {
    setIssuing(true)
    try {
      await settlementService.issueForOwner(id)
      toast.success('Đã lập hoá đơn đối soát và thông báo cho chủ sân')
      loadPayouts()
    } catch (err) {
      toast.error(err?.message || 'Không thể lập hoá đơn')
    } finally {
      setIssuing(false)
    }
  }

  const [confirmingBank, setConfirmingBank] = useState(false)
  const handleConfirmBankInfo = async () => {
    setConfirmingBank(true)
    try {
      const res = await userService.confirmBankInfo(id)
      setData((prev) => ({ ...prev, owner: res.user }))
      toast.success('Đã xác nhận thông tin ngân hàng của chủ sân')
    } catch (err) {
      toast.error(err?.message || 'Không thể xác nhận')
    } finally {
      setConfirmingBank(false)
    }
  }

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>
  if (!data) return null

  const { owner, stats, venues } = data
  const bal = payoutData?.balance
  const openInvoice = payoutData?.settlements?.find((x) => ['issued', 'reported'].includes(x.status))

  return (
    <div className={styles.page}>
      <PageHeader
        title={owner.name}
        subtitle={owner.businessName || 'Chưa có tên doanh nghiệp'}
        actions={<Button variant="outline" icon={<ArrowLeft size={15} />} onClick={() => navigate('/admin/owners')}>Quay lại</Button>}
      />

      <div className={styles.infoCard}>
        <div className={styles.avatar}>{owner.name?.[0] || '?'}</div>
        <div className={styles.infoGrid}>
          <div><span><Mail size={12} /> Email</span><strong>{owner.email}</strong></div>
          <div><span><Phone size={12} /> Điện thoại</span><strong>{owner.phone || 'Chưa có'}</strong></div>
          <div><span><Building2 size={12} /> Mã số thuế</span><strong>{owner.taxId || 'Chưa có'}</strong></div>
          <div><span><Banknote size={12} /> Ngân hàng</span><strong>{owner.bankName ? `${owner.bankName} — ••••${String(owner.bankAccount || '').slice(-4)}` : 'Chưa có'}</strong></div>
          <div><span><MapPin size={12} /> Địa chỉ kinh doanh</span><strong>{owner.businessAddress || 'Chưa có'}</strong></div>
        </div>
        <div className={styles.infoStatus}>
          <StatusBadge status={owner.status} />
          <span className={styles.joinedAt}>Tham gia từ {new Date(owner.createdAt).toLocaleDateString('vi-VN')}</span>
        </div>
      </div>

      {owner.bankInfoPendingReview && (
        <div className={styles.bankWarning}>
          <AlertTriangle size={20} />
          <div className={styles.bankWarningText}>
            <strong>Chủ sân vừa đổi thông tin ngân hàng, chưa được xác minh.</strong>
            <p>Vui lòng gọi điện xác nhận với chủ sân trước khi chi trả kỳ tiếp theo. Hệ thống sẽ không cho tạo phiếu thanh toán cho đến khi bạn xác nhận đã kiểm tra.</p>
          </div>
          <Button size="sm" variant="success" icon={<ShieldCheck size={14} />} loading={confirmingBank} onClick={handleConfirmBankInfo}>Xác nhận đã kiểm tra</Button>
        </div>
      )}

      <div className={styles.statsRow}>
        <StatCard icon={<LandPlot size={18} />} label="Địa điểm" value={`${stats.activeVenues}/${stats.totalVenues}`} color="primary" />
        <StatCard icon={<Trophy size={18} />} label="Tổng số sân" value={stats.totalCourts} color="accent" />
        <StatCard icon={<ClipboardList size={18} />} label="Lượt đặt sân" value={stats.totalBookings} color="secondary" />
        <StatCard icon={<Wallet size={18} />} label="Tổng doanh thu" value={formatCurrency(stats.totalRevenue)} color="success" />
        <StatCard icon={<Star size={18} />} label="Đánh giá TB" value={stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—'} color="warning" />
      </div>

      <div className={styles.payoutSection}>
        <div className={styles.payoutHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Đối soát hoa hồng</h3>
            <p className={styles.payoutSubtitle}>
              Khách chuyển tiền thẳng cho chủ sân · đang giữ {formatCurrency(bal?.cashHeld || 0)} · được hưởng {formatCurrency(bal?.entitlement || 0)} · {bal?.bookingCount || 0} lượt đặt
            </p>
          </div>
          <div className={styles.payoutOwed}>
            <span>{(bal?.balance || 0) < 0 ? 'Nền tảng cần chuyển lại chủ sân' : 'Chủ sân cần nộp hoa hồng'}</span>
            <strong>{formatCurrency(Math.abs(bal?.balance || 0))}</strong>
          </div>
          <Button icon={<Banknote size={16} />} onClick={handleIssue} loading={issuing} disabled={!!openInvoice || Math.abs(bal?.balance || 0) < 1000}>
            Lập hoá đơn
          </Button>
        </div>
        {openInvoice && (
          <p className={styles.payoutSubtitle}>
            Đang có hoá đơn {openInvoice.code} ({SETTLEMENT_STATUS[openInvoice.status].label}) — xử lý tại <Link to="/admin/settlements">Đối soát hoa hồng</Link>.
          </p>
        )}

        {payoutData?.settlements?.length > 0 && (
          <div className={styles.payoutHistory}>
            <p className={styles.payoutHistoryTitle}>Lịch sử hoá đơn</p>
            {payoutData.settlements.map(h => (
              <div key={h._id} className={styles.payoutRow}>
                <span className={styles.payoutDate}>{new Date(h.createdAt).toLocaleDateString('vi-VN')}</span>
                <span className={styles.payoutAmount}>{formatCurrency(h.amount)}</span>
                <span className={styles.payoutNote}>
                  {h.direction === 'owner_pays' ? 'Chủ sân nộp' : 'Nền tảng chuyển'} · {h.code}{' '}
                  <Badge size="sm" style={{ background: SETTLEMENT_STATUS[h.status].bg, color: SETTLEMENT_STATUS[h.status].color }}>{SETTLEMENT_STATUS[h.status].label}</Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.venuesSection}>
        <h3 className={styles.sectionTitle}>Địa điểm ({venues.length})</h3>
        {venues.length === 0 ? (
          <p className={styles.emptyText}>Chủ sân này chưa đăng địa điểm nào.</p>
        ) : (
          <div className={styles.venueList}>
            {venues.map(v => (
              <Link key={v._id} to={`/venues/${v._id}`} target="_blank" className={styles.venueCard}>
                <img src={getImageUrl(v.images?.[0]) || PLACEHOLDER_IMG} alt={v.name} className={styles.venueThumb} />
                <div className={styles.venueInfo}>
                  <p className={styles.venueName}>{v.name}</p>
                  <p className={styles.venueAddr}><MapPin size={11} /> {v.address?.district}, {v.address?.city}</p>
                  <div className={styles.venueMeta}>
                    <span>{v.courtCount} sân</span>
                    <span><Star size={11} fill="currentColor" strokeWidth={0} /> {v.rating > 0 ? v.rating.toFixed(1) : '—'} ({v.reviewCount})</span>
                  </div>
                </div>
                {v.isActive ? <CheckCircle2 size={16} className={styles.activeIcon} /> : <XCircle size={16} className={styles.inactiveIcon} />}
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
