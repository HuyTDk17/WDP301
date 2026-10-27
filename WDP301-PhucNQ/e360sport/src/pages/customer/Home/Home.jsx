import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, CalendarCheck, CreditCard, PartyPopper, Sparkles, LandPlot, Footprints, MapPinned, Star, ArrowRight } from 'lucide-react'
import SearchBar from '@/components/common/SearchBar/SearchBar'
import VenueCard from '@/components/venue/VenueCard/VenueCard'
import Skeleton from '@/components/ui/Skeleton/Skeleton'
import { useAuth } from '@/contexts/authState'
import { venueService } from '@/services/venueService'
import { settingsService } from '@/services/settingsService'
import { SPORTS, formatStatNumber } from '@/utils'
import styles from './Home.module.css'

const HOW_IT_WORKS = [
  { step: '01', Icon: Search, title: 'Tìm kiếm', desc: 'Tìm sân gần bạn theo môn thể thao, ngày và khu vực.' },
  { step: '02', Icon: CalendarCheck, title: 'Chọn khung giờ', desc: 'Xem lịch trống thật theo từng sân — cập nhật theo thời gian thực.' },
  { step: '03', Icon: CreditCard, title: 'Thanh toán an toàn', desc: 'Chuyển khoản ngân hàng qua mã QR. Giữ chỗ ngay khi giao dịch được xác nhận.' },
  { step: '04', Icon: PartyPopper, title: 'Vào sân chơi!', desc: 'Xuất trình mã xác nhận tại địa điểm và bắt đầu trận đấu.' },
]

// TRƯỚC ĐÂY: 4 con số này viết cứng trong code (2.500+ sân, 180K+ người chơi,
// 50+ thành phố, đánh giá 4.8) — với một nền tảng vừa mở, đây là số liệu bịa,
// không đúng sự thật với người dùng thật. Giờ lấy từ settingsService.getPublicStats()
// (tính thật từ dữ liệu — xem backend/controllers/settingsController.js#getPublicStats),
// ban đầu có thể nhỏ hoặc bằng 0 và tăng dần đúng thực tế thay vì một con số
// không bao giờ đúng.
const STAT_META = [
  { key: 'venues', label: 'Sân thể thao', Icon: LandPlot },
  { key: 'players', label: 'Người chơi đã đặt sân', Icon: Footprints },
  { key: 'cities', label: 'Thành phố', Icon: MapPinned },
  { key: 'rating', label: 'Đánh giá trung bình', Icon: Star },
]

function formatStat(key, stats) {
  if (!stats) return null
  if (key === 'rating') return stats.avgRating ? stats.avgRating.toFixed(1) : 'Chưa có'
  return formatStatNumber(stats[key] || 0)
}

const POPULAR_SPORTS = [
  { label: 'Bóng đá', value: 'football' },
  { label: 'Cầu lông', value: 'badminton' },
  { label: 'Tennis', value: 'tennis' },
  { label: 'Bóng rổ', value: 'basketball' },
]

export default function Home() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const [featuredVenues, setFeaturedVenues] = useState([])
  const [venuesLoading, setVenuesLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    venueService.getFeaturedVenues()
      .then((res) => setFeaturedVenues(res.venues || []))
      .catch(() => setFeaturedVenues([]))
      .finally(() => setVenuesLoading(false))
    settingsService.getPublicStats().then(setStats).catch(() => setStats({ venues: 0, cities: 0, players: 0, avgRating: null }))
    settingsService.getPublicSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  const renderOwnerCta = () => {
    if (isAuthenticated && user?.role === 'customer') {
      return <Link to="/owner-application" className={styles.ctaPrimary}>Đăng sân miễn phí <ArrowRight size={16} /></Link>
    }
    if (isAuthenticated && user?.role === 'owner') {
      return <Link to="/owner/dashboard" className={styles.ctaPrimary}>Vào trang chủ sân <ArrowRight size={16} /></Link>
    }
    return <Link to="/register?role=owner" className={styles.ctaPrimary}>Đăng sân miễn phí <ArrowRight size={16} /></Link>
  }

  return (
    <div className={styles.page}>
      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroBg}><div className={styles.heroBgGrad} /><div className={styles.heroPattern} /></div>
        <div className={`container ${styles.heroContent}`}>
          {/* TRƯỚC ĐÂY: "Nền tảng đặt sân thể thao số 1 Việt Nam" — một nền tảng
              vừa mở không có căn cứ nào để tự nhận "số 1". Đổi thành khẩu hiệu
              đúng với logo mới (PLAY · CONNECT · MOVE) thay vì một tuyên bố không
              kiểm chứng được. */}
          <div className={styles.heroTag}><Sparkles size={15} strokeWidth={2.25} /><span>Chơi · Kết nối · Vận động</span></div>
          <h1 className={styles.heroTitle}>Tìm & Đặt <br /><span className={styles.heroAccent}>Sân Thể Thao Lý Tưởng</span></h1>
          {/* TRƯỚC ĐÂY: "hàng nghìn sân thể thao" — số liệu bịa, xem STAT_META ở trên. */}
          <p className={styles.heroSub}>Khám phá sân thể thao gần bạn trên toàn Việt Nam. Đặt sân ngay, thanh toán an toàn, chơi ngay hôm nay.</p>
          <div className={styles.searchWrapper}><SearchBar variant="hero" /></div>
          <div className={styles.heroSuggestions}>
            <span className={styles.suggestLabel}>Phổ biến:</span>
            {POPULAR_SPORTS.map(s => <button key={s.value} className={styles.suggestChip} onClick={() => navigate(`/venues?sport=${s.value}`)}>{s.label}</button>)}
          </div>
        </div>
        <div className={styles.floatIcons}>
          {['⚽','🏀','🏸','🎾','🏐','🏊'].map((icon, i) => <span key={i} className={styles.floatIcon} style={{ '--delay': `${i * 0.4}s`, '--x': `${10 + i * 15}%` }}>{icon}</span>)}
        </div>
      </section>

      {/* THỐNG KÊ — số liệu THẬT, xem ghi chú ở STAT_META phía trên */}
      <section className={styles.statsBar}>
        <div className="container">
          <div className={styles.statsGrid}>
            {STAT_META.map((s) => (
              <div key={s.key} className={styles.statItem}>
                <span className={styles.statIcon}><s.Icon size={22} /></span>
                {stats ? <span className={styles.statValue}>{formatStat(s.key, stats)}</span> : <Skeleton height="28px" width="60px" />}
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DANH MỤC MÔN */}
      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <div><h2 className={styles.sectionTitle}>Khám phá theo môn thể thao</h2><p className={styles.sectionSub}>Tìm sân cho mọi môn thể thao bạn yêu thích</p></div>
            <Link to="/venues" className={styles.viewAll}>Xem tất cả <ArrowRight size={14} /></Link>
          </div>
          <div className={styles.sportsGrid}>
            {SPORTS.map(sport => (
              <Link key={sport.id} to={`/venues?sport=${sport.id}`} className={styles.sportCard} style={{ '--sport-color': sport.color }}>
                <div className={styles.sportIconWrap}><span className={styles.sportEmoji}>{sport.icon}</span></div>
                <span className={styles.sportName}>{sport.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SÂN NỔI BẬT — gọi API thật */}
      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <div><h2 className={styles.sectionTitle}>Sân nổi bật</h2><p className={styles.sectionSub}>Những sân thể thao đánh giá cao được chọn lọc cho bạn</p></div>
            <Link to="/venues" className={styles.viewAll}>Xem tất cả sân <ArrowRight size={14} /></Link>
          </div>

          {venuesLoading ? (
            <div className={styles.venueGrid}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={styles.skeletonCard}>
                  <Skeleton height="200px" />
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Skeleton height="18px" width="70%" />
                    <Skeleton height="13px" width="50%" />
                    <Skeleton height="13px" width="40%" />
                  </div>
                </div>
              ))}
            </div>
          ) : featuredVenues.length === 0 ? (
            <div className={styles.emptyVenues}>
              <span><LandPlot size={40} /></span>
              <h3>Chưa có sân nổi bật nào</h3>
              <p>Các chủ sân đang hoàn thiện thông tin. Quay lại sau hoặc xem tất cả sân.</p>
              <Link to="/venues" className={styles.viewAllBtn}>Xem tất cả sân thể thao <ArrowRight size={14} /></Link>
            </div>
          ) : (
            <div className={styles.venueGrid}>
              {featuredVenues.map(venue => <VenueCard key={venue._id} venue={venue} />)}
            </div>
          )}
        </div>
      </section>

      {/* CÁCH HOẠT ĐỘNG */}
      <section className={styles.howSection}>
        <div className="container">
          <div className={styles.sectionHeader} style={{ justifyContent: 'center', textAlign: 'center' }}>
            <div><h2 className={styles.sectionTitle}>ESport360 hoạt động như thế nào</h2><p className={styles.sectionSub}>Từ tìm kiếm đến chơi sân chỉ trong chưa đầy 2 phút</p></div>
          </div>
          <div className={styles.stepsGrid}>
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className={styles.stepCard}>
                <div className={styles.stepNumber}>{step.step}</div>
                <div className={styles.stepIcon}><step.Icon size={26} strokeWidth={1.75} /></div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDesc}>{step.desc}</p>
                {i < HOW_IT_WORKS.length - 1 && <div className={styles.stepArrow}><ArrowRight size={20} /></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KÊU GỌI CHỦ SÂN */}
      <section className={styles.ownerCta}>
        <div className="container">
          <div className={styles.ctaCard}>
            <div className={styles.ctaContent}>
              <span className={styles.ctaTag}>Dành cho chủ sân</span>
              <h2 className={styles.ctaTitle}>Đăng sân của bạn & Tăng doanh thu</h2>
              {/* TRƯỚC ĐÂY: "hàng nghìn chủ sân" — số liệu bịa cho nền tảng vừa mở. */}
              <p className={styles.ctaDesc}>Tham gia cùng các chủ sân đang kiếm thêm thu nhập với ESport360. Thiết lập miễn phí, công cụ quản lý mạnh mẽ.</p>
              <div className={styles.ctaBtns}>
                {renderOwnerCta()}
                <Link to="/venues" className={styles.ctaSecondary}>Xem sân mẫu</Link>
              </div>
            </div>
            <div className={styles.ctaVisual}>
              <div className={styles.ctaStats}>
                {/* TRƯỚC ĐÂY: "+47% Tăng doanh thu" (bịa, không có dữ liệu nào để
                    tính) và "0% Hoa hồng tháng đầu" (backend không có cơ chế nào
                    miễn hoa hồng tháng đầu — hứa suông với chủ sân thật). Thay
                    bằng thông tin THẬT: thiết lập không tốn phí (đúng — không có
                    phí khởi tạo nào trong hệ thống) và % hoa hồng thật lấy từ cài
                    đặt nền tảng, minh bạch thay vì che giấu bằng một con số giả. */}
                {[
                  { v: 'Miễn phí', l: 'Thiết lập tài khoản' },
                  { v: settings ? `${settings.commissionRate}%` : '…', l: 'Hoa hồng nền tảng' },
                  { v: '24/7', l: 'Hỗ trợ kỹ thuật' },
                ].map(s => (
                  <div key={s.l} className={styles.ctaStat}>
                    <span className={styles.ctaStatValue}>{s.v}</span>
                    <span className={styles.ctaStatLabel}>{s.l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
