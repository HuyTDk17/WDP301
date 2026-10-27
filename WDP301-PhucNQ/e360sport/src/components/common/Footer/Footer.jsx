import { Link } from 'react-router-dom'
import Logo from '@/components/common/Logo/Logo'
import styles from './Footer.module.css'

const SPORT_LINKS = [
  { label: 'Bóng đá', value: 'football' },
  { label: 'Bóng rổ', value: 'basketball' },
  { label: 'Cầu lông', value: 'badminton' },
  { label: 'Tennis', value: 'tennis' },
  { label: 'Bóng chuyền', value: 'volleyball' },
  { label: 'Bơi lội', value: 'swimming' },
]

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>
          <Link to="/" className={styles.logo} aria-label="ESport360 — Trang chủ"><Logo className={styles.logoImg} /></Link>
          <p className={styles.tagline}>Cách nhanh nhất để đặt sân cho trận đấu tiếp theo của bạn. Tìm kiếm, đặt sân và chơi tại các địa điểm thể thao hàng đầu trên toàn Việt Nam.</p>
          <div className={styles.socials}>
            {/* TRƯỚC ĐÂY: href="#" — bấm vào giật cuộn lên đầu trang mà không đi đâu cả.
                Chưa có tài khoản mạng xã hội thật nên tạm để dạng không click được
                thay vì trỏ tới một nơi không tồn tại. Thay bằng link thật khi có. */}
            {['Facebook', 'Instagram', 'TikTok', 'YouTube'].map(s => <span key={s} className={`${styles.socialBtn} ${styles.comingSoon}`} title="Sắp ra mắt" aria-label={`${s} (sắp ra mắt)`}>{s[0]}</span>)}
          </div>
        </div>
        <div className={styles.links}>
          <div className={styles.col}>
            <h4 className={styles.colTitle}>Nền tảng</h4>
            <Link to="/venues" className={styles.link}>Tìm sân thể thao</Link>
            <Link to="/register?role=owner" className={styles.link}>Đăng ký cho thuê sân</Link>
            <Link to="/bookings" className={styles.link}>Lịch sử đặt sân</Link>
            <Link to="/favorites" className={styles.link}>Sân yêu thích</Link>
          </div>
          <div className={styles.col}>
            <h4 className={styles.colTitle}>Môn thể thao</h4>
            {SPORT_LINKS.map(s => <a key={s.value} href={`/venues?sport=${s.value}`} className={styles.link}>{s.label}</a>)}
          </div>
          <div className={styles.col}>
            <h4 className={styles.colTitle}>Công ty</h4>
            {/* Chưa có trang Giới thiệu/Tuyển dụng/Blog/Liên hệ thật — xem ghi chú ở socials phía trên. */}
            <span className={`${styles.link} ${styles.comingSoon}`} title="Sắp ra mắt">Về chúng tôi</span>
            <span className={`${styles.link} ${styles.comingSoon}`} title="Sắp ra mắt">Tuyển dụng</span>
            <span className={`${styles.link} ${styles.comingSoon}`} title="Sắp ra mắt">Bài viết</span>
            <span className={`${styles.link} ${styles.comingSoon}`} title="Sắp ra mắt">Liên hệ</span>
          </div>
          <div className={styles.col}>
            <h4 className={styles.colTitle}>Hỗ trợ</h4>
            <span className={`${styles.link} ${styles.comingSoon}`} title="Sắp ra mắt">Trung tâm hỗ trợ</span>
            <Link to="/privacy-policy" className={styles.link}>Chính sách bảo mật</Link>
            <Link to="/terms-of-service" className={styles.link}>Điều khoản dịch vụ</Link>
          </div>
        </div>
      </div>
      <div className={styles.bottom}>
        <div className="container">
          <p>© {new Date().getFullYear()} ESport360. Bảo lưu mọi quyền.</p>
          <div className={styles.payments}>{['Chuyển khoản ngân hàng', 'VietQR'].map(p => <span key={p} className={styles.payBadge}>{p}</span>)}</div>
        </div>
      </div>
    </footer>
  )
}
