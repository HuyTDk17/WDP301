import { useState } from 'react'
import { ChevronDown, ChevronUp, SlidersHorizontal, Check, Star, LocateFixed, MapPin, X } from 'lucide-react'
import { SPORTS } from '@/utils'
import styles from './VenueFilters.module.css'

const AMENITIES = ['Bãi đỗ xe', 'Phòng thay đồ', 'Vòi sen', 'Cho thuê dụng cụ', 'Đèn chiếu sáng', 'Quầy giải khát', 'WiFi', 'Máy lạnh']
const PRICE_RANGES = [
  { label: 'Dưới 200K', value: '0-200000' },
  { label: '200K – 500K', value: '200000-500000' },
  { label: '500K – 1 triệu', value: '500000-1000000' },
  { label: 'Trên 1 triệu', value: '1000000-9999999' },
]

function Section({ id, title, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span>{title}</span>{open ? <ChevronUp size={16} strokeWidth={2.25} /> : <ChevronDown size={16} strokeWidth={2.25} />}
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

const RADII = [1, 3, 5, 10, 20]

export default function VenueFilters({ filters, onChange, onReset }) {
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const geo = filters.geo || null

  const findNearMe = () => {
    if (!navigator.geolocation) { setLocError('Trình duyệt không hỗ trợ định vị.'); return }
    setLocating(true); setLocError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onChange({ ...filters, geo: { type: 'near', lat: pos.coords.latitude, lng: pos.coords.longitude, radiusKm: geo?.radiusKm || 5 } })
      },
      () => { setLocating(false); setLocError('Không lấy được vị trí. Hãy cho phép truy cập vị trí trong trình duyệt.') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }
  const toggleSport = (id) => onChange({ ...filters, sports: filters.sports.includes(id) ? filters.sports.filter(s => s !== id) : [...filters.sports, id] })
  const toggleAmenity = (a) => onChange({ ...filters, amenities: filters.amenities.includes(a) ? filters.amenities.filter(x => x !== a) : [...filters.amenities, a] })

  return (
    <div className={styles.filters}>
      <div className={styles.header}>
        <h3 className={styles.title}><SlidersHorizontal size={17} strokeWidth={2.25} /> Bộ lọc</h3>
        <button className={styles.resetBtn} onClick={onReset}>Đặt lại</button>
      </div>

      <Section id="location" title="Vị trí">
        <button type="button" className={`${styles.sportChip} ${geo?.type === 'near' ? styles.sportChipActive : ''}`} onClick={findNearMe} disabled={locating} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
          <LocateFixed size={13} /> {locating ? 'Đang định vị…' : 'Tìm sân gần tôi'}
        </button>
        {geo?.type === 'near' && (
          <div className={styles.ratingChips}>
            {RADII.map(r => (
              <button key={r} type="button" className={`${styles.ratingChip} ${geo.radiusKm === r ? styles.ratingChipActive : ''}`} onClick={() => onChange({ ...filters, geo: { ...geo, radiusKm: r } })}>{r} km</button>
            ))}
          </div>
        )}
        {geo?.type === 'bounds' && (
          <span className={styles.sportChip} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
            <MapPin size={13} /> Khu vực đang chọn trên bản đồ
          </span>
        )}
        {geo && (
          <button type="button" className={styles.resetBtn} style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...filters, geo: null })}><X size={12} /> Bỏ lọc vị trí</button>
        )}
        {locError && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', margin: 0 }}>{locError}</p>}
      </Section>

      <Section id="sport" title="Môn thể thao">
        <div className={styles.sportGrid}>
          {SPORTS.map(s => (
            <button key={s.id} className={`${styles.sportChip} ${filters.sports.includes(s.id) ? styles.sportChipActive : ''}`} onClick={() => toggleSport(s.id)}>
              {s.icon} {s.name}
            </button>
          ))}
        </div>
      </Section>

      <Section id="price" title="Khoảng giá">
        <div className={styles.radioGroup}>
          {PRICE_RANGES.map(p => (
            <label key={p.value} className={styles.radioItem}>
              <input type="radio" name="price" className={styles.hiddenInput} checked={filters.priceRange === p.value} onChange={() => onChange({ ...filters, priceRange: filters.priceRange === p.value ? '' : p.value })} />
              <span className={styles.radioMark} />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section id="rating" title="Đánh giá tối thiểu">
        <div className={styles.ratingChips}>
          {[4.5, 4, 3.5, 3].map(r => (
            <button key={r} className={`${styles.ratingChip} ${filters.minRating === r ? styles.ratingChipActive : ''}`} onClick={() => onChange({ ...filters, minRating: filters.minRating === r ? null : r })}>{r}<Star size={12} fill="currentColor" strokeWidth={0} /> trở lên</button>
          ))}
        </div>
      </Section>

      <Section id="amenities" title="Tiện ích">
        <div className={styles.checkGroup}>
          {AMENITIES.map(a => (
            <label key={a} className={styles.checkItem}>
              <input type="checkbox" className={styles.hiddenInput} checked={filters.amenities.includes(a)} onChange={() => toggleAmenity(a)} />
              <span className={styles.checkMark}><Check size={12} strokeWidth={3} /></span>
              <span>{a}</span>
            </label>
          ))}
        </div>
      </Section>

      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel}>
          <span>Còn trống hôm nay</span>
          <span className={styles.switch}>
            <input type="checkbox" className={styles.hiddenInput} checked={filters.availableToday} onChange={() => onChange({ ...filters, availableToday: !filters.availableToday })} />
            <span className={styles.switchTrack} />
          </span>
        </label>
      </div>
    </div>
  )
}
