import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, Trophy, Tag } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { eventService, EVENT_TYPES, eventTypeLabel } from '@/services/eventService'
import { formatDateTime, formatCurrency, getImageUrl } from '@/utils'
import styles from './Events.module.css'

const PAGE_SIZE = 9

export default function EventList() {
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ events: [], totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    eventService.getEvents({ page, limit: PAGE_SIZE, type: type || undefined })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [page, type])

  const changeType = (t) => { setType(t); setPage(1) }

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.head}>
          <p className={styles.eyebrow}>Sự kiện</p>
          <h1 className={styles.title}>Giải đấu &amp; khuyến mãi từ các sân</h1>
          <p className={styles.sub}>Tham gia giải đấu phong trào, săn ưu đãi giờ vàng và các hoạt động thể thao quanh bạn.</p>
        </header>

        <div className={styles.chips}>
          {[{ value: '', label: 'Tất cả' }, ...EVENT_TYPES].map((t) => (
            <button key={t.value} type="button" className={`${styles.chip} ${type === t.value ? styles.chipActive : ''}`} onClick={() => changeType(t.value)}>{t.label}</button>
          ))}
        </div>

        {loading ? (
          <div className={styles.center}><Spinner size="lg" /></div>
        ) : error ? (
          <EmptyState icon={<CalendarDays size={48} />} title="Không tải được sự kiện" description="Vui lòng thử lại sau ít phút." />
        ) : data.events.length === 0 ? (
          <EmptyState icon={<CalendarDays size={48} />} title="Chưa có sự kiện sắp tới" description="Hãy quay lại sau — các sân sẽ sớm đăng giải đấu và ưu đãi mới." />
        ) : (
          <>
            <div className={styles.grid}>
              {data.events.map((e) => (
                <Link key={e._id} to={`/events/${e._id}`} className={styles.card}>
                  <div className={styles.cover}>
                    {e.imageUrl ? <img src={getImageUrl(e.imageUrl)} alt="" loading="lazy" /> : (e.type === 'promotion' ? <Tag size={36} /> : <Trophy size={36} />)}
                    <span className={styles.typeBadge}>{eventTypeLabel(e.type)}</span>
                    {e.phase === 'ongoing' && <span className={styles.liveBadge}>Đang diễn ra</span>}
                  </div>
                  <div className={styles.cardBody}>
                    <h2 className={styles.cardTitle}>{e.title}</h2>
                    {e.highlight && <p className={styles.highlight}>{e.highlight}</p>}
                    <p className={styles.meta}><CalendarDays size={14} /> {formatDateTime(e.startsAt)}</p>
                    <p className={styles.meta}><MapPin size={14} /> {e.venueId?.name || e.venueName}{e.venueId?.address?.city ? ` · ${e.venueId.address.city}` : ''}</p>
                    <p className={styles.price}>{e.price ? formatCurrency(e.price) : 'Miễn phí'}</p>
                  </div>
                </Link>
              ))}
            </div>
            {data.totalPages > 1 && (
              <div className={styles.pager}>
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trang trước</Button>
                <span>Trang {page}/{data.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Trang sau</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
