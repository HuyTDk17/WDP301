import { useState, useEffect } from 'react'
import { Outlet, Link } from 'react-router-dom'
import Logo from '@/components/common/Logo/Logo'
import ToastContainer from '@/components/ui/Toast/Toast'
import { settingsService } from '@/services/settingsService'
import { formatStatNumber } from '@/utils'
import styles from './AuthLayout.module.css'

// TRƯỚC ĐÂY: "2.500+ sân", "180K+ lượt đặt sân", "50+ thành phố" viết cứng —
// cùng loại số liệu bịa đã sửa ở trang chủ (Home.jsx), dùng lại đúng
// /api/stats/public để không có 2 nguồn số liệu khác nhau cho cùng một nền tảng.
const STAT_META = [
  { key: 'venues', label: 'Sân thể thao' },
  { key: 'bookings', label: 'Lượt đặt sân' },
  { key: 'cities', label: 'Thành phố' },
]

export default function AuthLayout() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    settingsService.getPublicStats().then(setStats).catch(() => setStats({ venues: 0, bookings: 0, cities: 0 }))
  }, [])

  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        <div className={styles.leftContent}>
          <Link to="/" className={styles.logo} aria-label="ESport360 — Trang chủ">
            <Logo className={styles.logoImg} />
          </Link>
          <h1 className={styles.headline}>Trận đấu tiếp theo của bạn bắt đầu từ đây.</h1>
          <p className={styles.sub}>Đặt sân thể thao chất lượng cao chỉ trong vài giây. Không cần gọi điện, không phiền phức — chỉ cần chơi.</p>
          <div className={styles.stats}>
            {STAT_META.map(s => (
              <div key={s.key} className={styles.stat}>
                <span className={styles.statValue}>{stats ? formatStatNumber(stats[s.key] || 0) : '…'}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.sports}>
            {['⚽', '🏀', '🏸', '🎾', '🏐', '🏊', '🏋️', '🧘'].map(s => <span key={s} className={styles.sportEmoji}>{s}</span>)}
          </div>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.card}><Outlet /></div>
      </div>
      <ToastContainer />
    </div>
  )
}
