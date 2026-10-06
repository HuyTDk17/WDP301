import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, MapPin } from 'lucide-react'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { favoriteService } from '@/services/notificationService'
import Rating from '@/components/ui/Rating/Rating'
import Badge from '@/components/ui/Badge/Badge'
import { formatCurrency, getSport, getImageUrl } from '@/utils'
import styles from './VenueCard.module.css'

const PLACEHOLDER_IMG = 'https://placehold.co/600x400/e5e9f2/8a94a6?text=ESport360'

export default function VenueCard({ venue, layout = 'grid' }) {
  const { isAuthenticated, user } = useAuth()
  const { toast } = useToast()
  const [isFav, setIsFav] = useState(venue.isFavorite || false)
  const [loading, setLoading] = useState(false)

  const sport = getSport(venue.sports?.[0])
  // Giá hiển thị: "giá từ X" — venue có thể có nhiều sân con với giá khác nhau
  const displayPrice = venue.minPricePerHour ?? venue.pricePerHour ?? 0

  const toggleFavorite = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isAuthenticated) { toast.info('Vui lòng đăng nhập để lưu sân yêu thích'); return }
    if (user?.role !== 'customer') { toast.info('Chỉ tài khoản khách hàng mới có thể lưu yêu thích'); return }
    setLoading(true)
    try {
      if (isFav) { await favoriteService.removeFavorite(venue._id); toast.success('Đã xóa khỏi yêu thích') }
      else { await favoriteService.addFavorite(venue._id); toast.success('Đã thêm vào yêu thích') }
      setIsFav(v => !v)
    } catch {
      toast.error('Đã có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Link to={`/venues/${venue._id}`} className={`${styles.card} ${layout === 'list' ? styles.listLayout : ''}`}>
      <div className={styles.imageWrap}>
        <img src={getImageUrl(venue.images?.[0]) || PLACEHOLDER_IMG} alt={venue.name} className={styles.image} loading="lazy" />
        {sport && <span className={styles.sportTag} style={{ background: sport.color }}>{sport.icon} {sport.name}</span>}
        <button className={`${styles.favBtn} ${isFav ? styles.favActive : ''}`} onClick={toggleFavorite} disabled={loading} aria-label={isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}>
          <Heart size={17} strokeWidth={2.25} fill={isFav ? 'currentColor' : 'none'} />
        </button>
        {venue.isActive === false && <div className={styles.closedOverlay}>Tạm đóng cửa</div>}
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <h3 className={styles.name}>{venue.name}</h3>
          <Rating value={venue.rating || 0} size="sm" count={venue.reviewCount || 0} />
        </div>
        <p className={styles.location}><MapPin size={13} strokeWidth={2.25} className={styles.locationIcon} /> {venue.address?.district}, {venue.address?.city}</p>
        {venue.amenities?.length > 0 && (
          <div className={styles.amenities}>
            {venue.amenities.slice(0, 3).map(a => <span key={a} className={styles.amenityChip}>{a}</span>)}
          </div>
        )}
        <div className={styles.footer}>
          <div className={styles.price}>
            <span className={styles.priceLabel}>Từ</span>
            <span className={styles.priceAmount}>{formatCurrency(displayPrice)}</span>
            <span className={styles.priceUnit}>/giờ</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
