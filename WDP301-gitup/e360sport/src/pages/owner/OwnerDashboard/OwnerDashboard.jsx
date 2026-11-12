import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, LandPlot, Wallet, ClipboardList, Hourglass, ArrowRight } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { statsService } from '@/services/notificationService'
import { bookingService } from '@/services/bookingService'
import { venueService } from '@/services/venueService'
import { formatCurrency, formatDate, getImageUrl } from '@/utils'
import styles from './OwnerDashboard.module.css'

export default function OwnerDashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [recentBookings, setRecentBookings] = useState([])
  const [venues, setVenues] = useState([])

  useEffect(() => {
    Promise.all([
      statsService.getOwnerStats().catch(() => null),
      bookingService.getOwnerBookings({ limit: 5 }).catch(() => ({ bookings: [] })),
      venueService.getOwnerVenues().catch(() => ({ venues: [] })),
    ]).then(([statsRes, bookingsRes, venuesRes]) => {
      setStats(statsRes)
      setRecentBookings((bookingsRes.bookings || []).slice(0, 5))
      setVenues(venuesRes.venues || [])
    }).finally(() => setLoading(false))
  }, [])

  const bookingColumns = [
    { header: 'Khách hàng', accessor: 'customerId', render: (val) => <div className={styles.customerCell}><div className={styles.customerAvatar}>{val?.name?.[0] || '?'}</div><span>{val?.name || 'Khách hàng'}</span></div> },
    { header: 'Địa điểm / Sân', accessor: 'venueName', render: (v, row) => `${v} · ${row.courtName}` },
    { header: 'Ngày & Giờ', accessor: 'date', render: (v, row) => <div className={styles.dateCell}><span>{formatDate(v)}</span><span className={styles.timeText}>{row.startTime}–{row.endTime}</span></div> },
    { header: 'Số tiền', accessor: 'amount', render: v => formatCurrency(v) },
    { header: 'Trạng thái', accessor: 'status', render: v => <StatusBadge status={v} /> },
  ]

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  const hasNoVenues = venues.length === 0

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tổng quan"
        subtitle="Chào mừng trở lại! Đây là tổng quan kinh doanh của bạn."
        actions={<Link to="/owner/venues/create"><Button icon={<Plus size={16} />}>Thêm địa điểm</Button></Link>}
      />

      {hasNoVenues ? (
        <EmptyState
          icon={<LandPlot size={48} />}
          title="Chào mừng bạn đến với ESport360!"
          description="Hãy đăng địa điểm đầu tiên để bắt đầu nhận đặt sân từ khách hàng thật."
          action={() => window.location.assign('/owner/venues/create')}
          actionLabel="Đăng địa điểm đầu tiên"
        />
      ) : (
        <>
          <div className={styles.statsGrid}>
            <StatCard icon={<Wallet size={18} />} label="Tổng doanh thu" value={formatCurrency(stats?.totalRevenue || 0)} color="success" />
            <StatCard icon={<ClipboardList size={18} />} label="Tổng lượt đặt sân" value={(stats?.totalBookings || 0).toLocaleString()} color="primary" />
            <StatCard icon={<LandPlot size={18} />} label="Địa điểm hoạt động" value={stats?.activeVenues ?? venues.filter(v => v.isActive).length} color="secondary" />
            <StatCard icon={<Hourglass size={18} />} label="Chờ xác nhận" value={stats?.pendingBookings || 0} changeType="neutral" color="warning" />
          </div>

          <DataTable
            title="Lượt đặt sân gần đây"
            columns={bookingColumns}
            data={recentBookings}
            searchable={false}
            pageSize={5}
            emptyText="Chưa có lượt đặt sân nào"
            headerRight={<Link to="/owner/bookings" className={styles.viewAllLink}>Xem tất cả <ArrowRight size={13} /></Link>}
          />

          <div>
            <div className={styles.venuesHeader}>
              <h3 className={styles.venuesTitle}>Địa điểm của tôi</h3>
              <Link to="/owner/venues" className={styles.viewAllLink}>Quản lý <ArrowRight size={13} /></Link>
            </div>
            <div className={styles.venueCards}>
              {venues.slice(0, 3).map(v => (
                <div key={v._id} className={styles.venueCard}>
                  <div className={styles.venueCardHeader}>
                    <img src={getImageUrl(v.images?.[0]) || 'https://placehold.co/100x100/e5e9f2/8a94a6?text=SV'} alt={v.name} className={styles.venueCardImg} />
                    <StatusBadge status={v.isActive ? 'active' : 'inactive'} />
                  </div>
                  <h4 className={styles.venueCardName}>{v.name}</h4>
                  <Link to={`/owner/venues/${v._id}/edit`}><Button variant="outline" size="sm" fullWidth>Sửa địa điểm</Button></Link>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
