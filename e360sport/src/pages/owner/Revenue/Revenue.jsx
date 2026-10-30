import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Wallet, ClipboardList, Calculator, Banknote } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { statsService } from '@/services/notificationService'
import { venueService } from '@/services/venueService'
import { settlementService } from '@/services/settlementService'
import { formatCurrency, formatDate, toLocalISODate } from '@/utils'
import styles from './Revenue.module.css'

export default function Revenue() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [revenueByMonth, setRevenueByMonth] = useState([])
  const [venues, setVenues] = useState([])
  const [payoutData, setPayoutData] = useState(null)
  const [feeMonth, setFeeMonth] = useState(() => toLocalISODate().slice(0, 7))
  const [feeData, setFeeData] = useState(null)
  const [feeLoading, setFeeLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      statsService.getOwnerStats().catch(() => null),
      statsService.getOwnerRevenue().catch(() => ({ revenue: [] })),
      venueService.getOwnerVenues().catch(() => ({ venues: [] })),
      settlementService.getMyCommission().catch(() => null),
    ]).then(([statsRes, revenueRes, venuesRes, payoutRes]) => {
      setStats(statsRes)
      setRevenueByMonth(revenueRes.revenue || [])
      setVenues(venuesRes.venues || [])
      setPayoutData(payoutRes)
    }).finally(() => setLoading(false))
  }, [])

  // Phí dịch vụ theo từng đơn của tháng đang chọn
  useEffect(() => {
    let cancelled = false
    setFeeLoading(true)
    settlementService.getFeeOrders(feeMonth)
      .then(r => { if (!cancelled) setFeeData(r) })
      .catch(() => { if (!cancelled) setFeeData(null) })
      .finally(() => { if (!cancelled) setFeeLoading(false) })
    return () => { cancelled = true }
  }, [feeMonth])

  const avgPerBooking = stats?.totalBookings ? Math.round((stats.totalRevenue || 0) / stats.totalBookings) : 0

  const venueColumns = [
    { header: 'Địa điểm', accessor: 'name' },
    { header: 'Trạng thái', accessor: 'status', render: v => v === 'approved' ? 'Đã duyệt' : v === 'pending' ? 'Chờ duyệt' : 'Bị từ chối' },
  ]

  const feeColumns = [
    { header: 'Ngày đặt', accessor: 'date', render: (v, row) => `${formatDate(v)} · ${row.startTime}–${row.endTime}` },
    { header: 'Địa điểm / sân', accessor: 'venueName', render: (v, row) => `${v || '—'}${row.courtName ? ` · ${row.courtName}` : ''}` },
    { header: 'Giá sân', accessor: 'amount', render: v => formatCurrency(v) },
    { header: 'Phí dịch vụ', accessor: 'fee', render: v => <strong>{formatCurrency(v)}</strong> },
  ]

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  if (!stats || stats.totalBookings === 0) {
    return (
      <div className={styles.page}>
        <PageHeader title="Phân tích doanh thu" subtitle="Theo dõi thu nhập thực nhận (đã trừ phí dịch vụ nền tảng) trên tất cả địa điểm của bạn" />
        <EmptyState icon={<BarChart3 size={48} />} title="Chưa có dữ liệu doanh thu" description="Doanh thu sẽ hiển thị ở đây sau khi có lượt đặt sân hoàn tất." />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Phân tích doanh thu" subtitle="Theo dõi thu nhập thực nhận (đã trừ phí dịch vụ nền tảng) trên tất cả địa điểm của bạn" />
      <div className={styles.statsRow}>
        <StatCard icon={<Wallet size={18} />} label="Tổng doanh thu" value={formatCurrency(stats.totalRevenue || 0)} color="success" />
        <StatCard icon={<ClipboardList size={18} />} label="Tổng lượt đặt" value={(stats.totalBookings || 0).toLocaleString()} color="secondary" />
        <StatCard icon={<Calculator size={18} />} label="Trung bình/lượt" value={formatCurrency(avgPerBooking)} color="warning" />
      </div>

      {revenueByMonth.length > 0 && (
        <div className={styles.monthlyTable}>
          <h3>Doanh thu theo tháng</h3>
          <div className={styles.monthlyList}>
            {revenueByMonth.map(m => (
              <div key={m.month} className={styles.monthlyRow}>
                <span>
                  {m.month}
                  {/* Tách riêng khoản bồi thường, nếu không chủ sân sẽ không
                      hiểu vì sao công nợ tháng này khác tổng tiền sân. */}
                  {m.fee > 0 && (
                    <span className={styles.compensationNote}>
                      phí dịch vụ nền tảng {formatCurrency(m.fee)} (đã trừ vào số tiền này)
                    </span>
                  )}
                  {m.compensation > 0 && (
                    <span className={styles.compensationNote}>
                      gồm {formatCurrency(m.compensation)} bồi thường chuyển sân
                    </span>
                  )}
                </span>
                <strong>{formatCurrency(m.amount)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {payoutData && (
        <div className={styles.payoutSection}>
          <div className={styles.payoutHeader}>
            <div>
              <h3>Phí dịch vụ nền tảng</h3>
              <p className={styles.payoutSubtitle}>
                Khách chuyển tiền thẳng vào tài khoản của bạn. Mỗi đơn có một khoản phí dịch vụ, được ghi lại ở bảng bên dưới.
                Ngày 1 hằng tháng hệ thống gửi hoá đơn kèm mã QR để bạn nộp
                {payoutData.policy?.lockDays ? `; quá ${payoutData.policy.lockDays} ngày kể từ khi lập hoá đơn mà chưa nộp, địa điểm sẽ bị khoá` : ''}.
                {' '}<Link to="/owner/commission">Xem chi tiết &amp; thanh toán</Link>
              </p>
            </div>
            <div className={styles.payoutOwed}>
              <Banknote size={22} />
              <strong>{formatCurrency(Math.max(0, payoutData.balance?.balance || 0))}</strong>
              <span>phí dịch vụ cần nộp</span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.monthlyTable}>
        <div className={styles.feeHeader}>
          <div>
            <h3>Phí dịch vụ theo đơn</h3>
            <p className={styles.payoutSubtitle}>
              {feeData ? `${feeData.orders.length} đơn · tổng phí ${formatCurrency(feeData.totalFee)}` : 'Chọn tháng để xem'}
            </p>
          </div>
          <input
            type="month"
            className={styles.monthInput}
            value={feeMonth}
            max={toLocalISODate().slice(0, 7)}
            onChange={e => e.target.value && setFeeMonth(e.target.value)}
            aria-label="Chọn tháng"
          />
        </div>
        <DataTable
          columns={feeColumns}
          data={feeData?.orders || []}
          loading={feeLoading}
          searchable={false}
          pageSize={10}
          emptyText="Tháng này chưa có đơn nào phát sinh phí dịch vụ"
        />
      </div>

      <DataTable title="Địa điểm của tôi" columns={venueColumns} data={venues} searchable={false} />
    </div>
  )
}
