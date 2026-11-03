import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, MapPin, Ticket, AlertTriangle } from 'lucide-react'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Button from '@/components/ui/Button/Button'
import { eventService, eventTypeLabel } from '@/services/eventService'
import { formatDateTime, formatCurrency, getImageUrl } from '@/utils'
import styles from './Events.module.css'

export default function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setLoading(true)
    setMissing(false)
    eventService.getEventById(id)
      .then((res) => setEvent(res.event))
      .catch(() => setMissing(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className={styles.page}><div className={styles.center}><Spinner size="lg" /></div></div>
  if (missing || !event) {
    return (
      <div className={styles.page}>
        <div className="container">
          <Link to="/events" className={styles.back}><ArrowLeft size={15} /> Tất cả sự kiện</Link>
          <EmptyState icon={<CalendarDays size={48} />} title="Không tìm thấy sự kiện" description="Sự kiện có thể đã bị gỡ hoặc đường dẫn không đúng." />
        </div>
      </div>
    )
  }

  const venue = event.venueId
  const venueId = venue?._id
  // Nội dung là văn bản thuần: hiển thị bằng text (không HTML thô) nên không có XSS.
  const paragraphs = event.description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  return (
    <div className={styles.page}>
      <div className="container">
        <article className={styles.article}>
          <Link to="/events" className={styles.back}><ArrowLeft size={15} /> Tất cả sự kiện</Link>

          {event.phase === 'cancelled' && <div className={`${styles.notice} ${styles.noticeDanger}`}><AlertTriangle size={16} /> Sự kiện này đã bị hủy bởi đơn vị tổ chức.</div>}
          {event.phase === 'ended' && <div className={styles.notice}><AlertTriangle size={16} /> Sự kiện này đã kết thúc.</div>}

          <p className={styles.eyebrow}>{eventTypeLabel(event.type)}</p>
          <h1 className={styles.articleTitle}>{event.title}</h1>
          {event.highlight && <p className={styles.highlightLg}>{event.highlight}</p>}
          {event.imageUrl && <img className={styles.articleCover} src={getImageUrl(event.imageUrl)} alt="" />}

          <ul className={styles.facts}>
            <li><CalendarDays size={16} /><span><strong>{formatDateTime(event.startsAt)}</strong> → {formatDateTime(event.endsAt)}</span></li>
            <li><MapPin size={16} /><span>{venue?.name || event.venueName}{venue?.address ? ` — ${[venue.address.street, venue.address.district, venue.address.city].filter(Boolean).join(', ')}` : ''}</span></li>
            <li><Ticket size={16} /><span>{event.price ? `Phí tham gia: ${formatCurrency(event.price)}` : 'Miễn phí tham gia'}</span></li>
          </ul>

          <div className={styles.body}>{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>

          {venueId && (
            <div className={styles.cta}>
              <p>Muốn đến chơi? Xem sân và đặt lịch ngay tại địa điểm tổ chức.</p>
              <Link to={`/venues/${venueId}`}><Button>Xem địa điểm &amp; đặt sân</Button></Link>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
