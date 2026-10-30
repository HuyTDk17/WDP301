import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, Building2, LandPlot, ClipboardList, PartyPopper, ArrowRight } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { statsService, userService } from '@/services/notificationService'
import { bookingService } from '@/services/bookingService'
import { formatCompactNumber, formatCurrency, formatDate } from '@/utils'
import styles from './AdminDashboard.module.css'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [recentBookings, setRecentBookings] = useState([])
  const [pendingOwnerApps, setPendingOwnerApps] = useState([])

  useEffect(() => {
    Promise.all([
      statsService.getAdminStats().catch(() => null),
      bookingService.getCommissionReport({ limit: 4 }).catch(() => ({ bookings: [] })),
      userService.getOwners().catch(() => ({ owners: [] })),
    ]).then(([statsRes, bookingsRes, ownersRes]) => {
      setStats(statsRes)
      setRecentBookings((bookingsRes.bookings || []).slice(0, 4))
      setPendingOwnerApps((ownersRes.owners || []).filter(o => o.ownerApplicationStatus === 'pending').slice(0, 4))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <PageHeader title="Tổng quan quản trị" subtitle="Tổng quan toàn hệ thống — Nền tảng ESport360" />

      <div className={styles.statsGrid}>
        <StatCard icon={<Users size={18} />} label="Tổng người dùng" value={(stats?.totalUsers || 0).toLocaleString()} color="primary" />
        <StatCard icon={<Building2 size={18} />} label="Tổng chủ sân" value={(stats?.totalOwners || 0).toLocaleString()} change={`${stats?.pendingOwners || 0} hồ sơ chờ duyệt`} changeType="neutral" color="secondary" />
        <StatCard icon={<LandPlot size={18} />} label="Địa điểm hoạt động" value={(stats?.totalVenues || 0).toLocaleString()} color="accent" onClick={() => navigate('/admin/venues')} />
        <StatCard icon={<ClipboardList size={18} />} label="Tổng lượt đặt sân" value={(stats?.totalBookings || 0).toLocaleString()} color="success" />
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.listCard}>
          <div className={styles.listHeader}><h3 className={styles.listTitle}>Hoa hồng gần đây</h3><Link to="/admin/commissions" className={styles.viewAll}>Xem tất cả <ArrowRight size={13} /></Link></div>
          {recentBookings.length === 0 ? <p className={styles.emptyText}>Chưa có lượt đặt nào phát sinh hoa hồng</p> : (
            <div className={styles.userList}>
              {recentBookings.map(b => (
                <div key={b._id} className={styles.userItem}>
                  <div className={styles.userAvatar}>{(b.ownerName || '?')[0]}</div>
                  <div className={styles.userInfo}>
                    <p className={styles.userName}>{b.venueName || 'N/A'}</p>
                    <p className={styles.userMeta}>{b.ownerName || 'N/A'} · {formatDate(b.date)} · hoa hồng {formatCurrency(b.commission || 0)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.listCard}>
          <div className={styles.listHeader}><h3 className={styles.listTitle}>Hồ sơ chủ sân chờ duyệt</h3><Link to="/admin/owners" className={styles.viewAll}>Xét duyệt tất cả <ArrowRight size={13} /></Link></div>
          {pendingOwnerApps.length === 0 ? <p className={styles.emptyText}><PartyPopper size={15} className={styles.emptyIcon} /> Không có hồ sơ nào chờ duyệt</p> : (
            <div className={styles.pendingList}>
              {pendingOwnerApps.map(o => (
                <div key={o._id} className={styles.pendingItem}>
                  <div className={styles.userAvatar}>{o.name?.[0] || '?'}</div>
                  <div className={styles.pendingInfo}><p className={styles.pendingName}>{o.businessName || o.name}</p><p className={styles.pendingMeta}>{o.name} · {o.email}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
