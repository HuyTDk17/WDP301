import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ArrowRight } from 'lucide-react'
import { eventService, eventTypeLabel } from '@/services/eventService'
import { formatDateTime } from '@/utils'
import styles from './VenueEvents.module.css'

/** Sự kiện sắp diễn ra tại một địa điểm (trang chi tiết địa điểm). Không có sự kiện nào thì không vẽ gì. */
export default function VenueEvents({ venueId }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    let alive = true
    eventService.getEvents({ venueId, limit: 3 })
      .then((res) => { if (alive) setEvents(res.events || []) })
      .catch(() => {})
    return () => { alive = false }
  }, [venueId])

  if (events.length === 0) return null

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}><CalendarDays size={18} /> Sự kiện sắp tới tại đây</h2>
        <Link to="/events" className={styles.all}>Tất cả sự kiện <ArrowRight size={14} /></Link>
      </div>
      <div className={styles.list}>
        {events.map((e) => (
          <Link key={e._id} to={`/events/${e._id}`} className={styles.item}>
            <span className={styles.type}>{eventTypeLabel(e.type)}{e.phase === 'ongoing' ? ' · Đang diễn ra' : ''}</span>
            <span className={styles.name}>{e.title}</span>
            {e.highlight && <span className={styles.highlight}>{e.highlight}</span>}
            <span className={styles.when}>{formatDateTime(e.startsAt)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
