import { useState, useEffect } from 'react'
import { BarChart3, Wallet, ClipboardList, Percent } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { statsService } from '@/services/notificationService'
import { settingsService } from '@/services/settingsService'
import { formatCurrency, formatCompactNumber } from '@/utils'
import styles from './RevenueReports.module.css'

export default function RevenueReports() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [revenueByMonth, setRevenueByMonth] = useState([])
  const [commissionRate, setCommissionRate] = useState(5)

  useEffect(() => {
    Promise.all([
      statsService.getAdminStats().catch(() => null),
      statsService.getAdminRevenue().catch(() => ({ revenue: [] })),
      settingsService.getPublicSettings().catch(() => null),
    ]).then(([statsRes, revenueRes, settingsRes]) => {
      setStats(statsRes)
      setRevenueByMonth(revenueRes.revenue || [])
      if (settingsRes?.commissionRate !== undefined) setCommissionRate(settingsRes.commissionRate)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  const totalPlatformRevenue = revenueByMonth.reduce((s, d) => s + (d.revenue || 0), 0)

  if (!stats || revenueByMonth.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader title="Báo cáo doanh thu" subtitle="Hiệu quả tài chính toàn nền tảng" />
        <EmptyState icon={<BarChart3 size={48} />} title="Chưa có dữ liệu doanh thu" description="Báo cáo sẽ hiển thị khi có lượt đặt sân hoàn tất trên nền tảng." />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Báo cáo doanh thu" subtitle="Hiệu quả tài chính toàn nền tảng" />
      <div className={styles.summaryCards}>
        <StatCard icon={<Wallet size={18} />} label="Hoa hồng nền tảng" value={formatCompactNumber(totalPlatformRevenue)} color="success" />
        <StatCard icon={<ClipboardList size={18} />} label="Tổng lượt đặt" value={(stats.totalBookings || 0).toLocaleString()} color="secondary" />
        <StatCard icon={<Percent size={18} />} label="Tỉ lệ hoa hồng" value={`${commissionRate}%`} changeType="neutral" color="accent" />
      </div>
      <div className={styles.monthlyTable}>
        <h3>Doanh thu nền tảng theo tháng</h3>
        <div className={styles.monthlyList}>
          {revenueByMonth.map(m => (
            <div key={m.month} className={styles.monthlyRow}><span>{m.month}</span><strong>{formatCurrency(m.revenue)}</strong><span className={styles.bookingCount}>{m.bookings} lượt</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}
