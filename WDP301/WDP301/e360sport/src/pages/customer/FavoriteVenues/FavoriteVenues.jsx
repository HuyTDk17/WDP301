import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import VenueCard from '@/components/venue/VenueCard/VenueCard'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Spinner from '@/components/ui/Spinner/Spinner'
import { favoriteService } from '@/services/notificationService'
import styles from './FavoriteVenues.module.css'

export default function FavoriteVenues() {
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    favoriteService.getFavorites()
      .then((res) => setFavorites(res.venues || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}><h1 className={styles.title}>Sân yêu thích</h1><p className={styles.sub}>{loading ? 'Đang tải...' : `${favorites.length} sân đã lưu`}</p></div>
        {loading ? (
          <div className={styles.loadingState}><Spinner size="lg" /></div>
        ) : favorites.length === 0 ? (
          <EmptyState icon={<Heart size={48} />} title="Chưa có sân yêu thích" description="Lưu lại các sân bạn yêu thích để truy cập nhanh sau này." action={() => window.location.assign('/venues')} actionLabel="Tìm sân thể thao" />
        ) : (
          <div className={styles.grid}>{favorites.map(v => <VenueCard key={v._id} venue={{ ...v, isFavorite: true }} />)}</div>
        )}
      </div>
    </div>
  )
}
