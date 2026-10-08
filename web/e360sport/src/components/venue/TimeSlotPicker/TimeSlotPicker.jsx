import Skeleton from '@/components/ui/Skeleton/Skeleton'
import { formatTime } from '@/utils'
import styles from './TimeSlotPicker.module.css'

export default function TimeSlotPicker({ slots = [], selected = [], onToggle, loading, maxSlots }) {
  if (loading) {
    return <div className={styles.grid}>{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} height="44px" />)}</div>
  }

  if (slots.length === 0) {
    return <div className={styles.empty}><p>Không có khung giờ trống cho ngày này</p></div>
  }

  const isSelected = (slot) => selected.some(s => s.start === slot.start)
  const isDisabled = (slot) => slot.isBooked || slot.isPast || (maxSlots && !isSelected(slot) && selected.length >= maxSlots)

  return (
    <div>
      {maxSlots && (
        <p className={styles.hint}>Đã chọn {selected.length} khung giờ{maxSlots && ` (tối đa ${maxSlots})`}</p>
      )}
      <div className={styles.grid}>
        {slots.map(slot => (
          <button key={slot.start} className={`${styles.slot} ${isSelected(slot) ? styles.selected : ''} ${slot.isBooked ? styles.booked : ''} ${slot.isPast ? styles.past : ''}`} onClick={() => !isDisabled(slot) && onToggle(slot)} disabled={isDisabled(slot)}>
            <span className={styles.time}>{formatTime(slot.start)}</span>
            <span className={styles.duration}>1 giờ</span>
            {slot.isBooked && <span className={styles.bookedLabel}>Đã đặt</span>}
            {!slot.isBooked && slot.isPast && <span className={styles.bookedLabel}>Đã qua</span>}
          </button>
        ))}
      </div>
      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--bg-surface)', border: '1.5px solid var(--border)' }} /> Còn trống</span>
        <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--primary)' }} /> Đang chọn</span>
        <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--border)' }} /> Đã đặt / Đã qua</span>
      </div>
    </div>
  )
}
