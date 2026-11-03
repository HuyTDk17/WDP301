import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Trophy, CalendarDays, Search } from 'lucide-react'
import styles from './SearchBar.module.css'
import { SPORTS, toLocalISODate } from '@/utils'

export default function SearchBar({ variant = 'default', onSearch }) {
  const [query, setQuery] = useState('')
  const [sport, setSport] = useState('')
  const [date, setDate] = useState('')
  const navigate = useNavigate()

  const handleSearch = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (sport) params.set('sport', sport)
    if (date) params.set('date', date)
    navigate(`/venues?${params.toString()}`)
    onSearch?.({ query, sport, date })
  }

  return (
    <form className={`${styles.searchBar} ${styles[variant]}`} onSubmit={handleSearch}>
      <div className={styles.field}>
        <span className={styles.fieldIcon}><MapPin size={18} strokeWidth={2} /></span>
        <input type="text" className={styles.input} placeholder="Tìm sân, khu vực..." value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className={styles.divider} />
      <div className={styles.field}>
        <span className={styles.fieldIcon}><Trophy size={18} strokeWidth={2} /></span>
        <select className={styles.select} value={sport} onChange={e => setSport(e.target.value)}>
          <option value="">Tất cả môn</option>
          {SPORTS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
        </select>
      </div>
      <div className={styles.divider} />
      <div className={styles.field}>
        <span className={styles.fieldIcon}><CalendarDays size={18} strokeWidth={2} /></span>
        <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} min={toLocalISODate()} />
      </div>
      <button type="submit" className={styles.searchBtn}><Search size={18} strokeWidth={2.25} /><span>Tìm kiếm</span></button>
    </form>
  )
}
