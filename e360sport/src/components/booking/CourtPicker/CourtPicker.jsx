import { LayoutGrid } from 'lucide-react'
import { formatCurrency, getSport } from '@/utils'
import styles from './CourtPicker.module.css'

/**
 * Hiển thị danh sách sân con (court) thuộc 1 địa điểm để khách chọn.
 * Mỗi địa điểm có thể có nhiều sân (VD: Sân A, Sân B) với giá khác nhau.
 */
export default function CourtPicker({ courts = [], selectedCourtId, onSelect, loading }) {
  if (loading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 3 }, (_, i) => <div key={i} className={styles.skeleton} />)}
      </div>
    )
  }

  if (courts.length === 0) {
    return (
      <div className={styles.empty}>
        <LayoutGrid size={28} strokeWidth={1.75} />
        <p>Địa điểm này hiện chưa có sân nào hoạt động</p>
      </div>
    )
  }

  return (
    <div className={styles.grid}>
      {courts.map(court => {
        const sport = getSport(court.type)
        const isActive = court.status === 'active'
        const isSelected = selectedCourtId === court._id

        return (
          <button
            key={court._id}
            className={`${styles.card} ${isSelected ? styles.selected : ''} ${!isActive ? styles.disabled : ''}`}
            onClick={() => isActive && onSelect(court)}
            disabled={!isActive}
          >
            <div className={styles.cardHeader}>
              <span className={styles.courtName}>{court.name}</span>
              {sport && <span className={styles.sportTag} style={{ background: sport.color + '15', color: sport.color }}>{sport.icon} {sport.name}</span>}
            </div>
            <div className={styles.cardMeta}>
              {court.size && <span>{court.size}</span>}
              {court.surface && <span>· {court.surface}</span>}
            </div>
            <div className={styles.cardPrice}>{formatCurrency(court.pricePerHour)}<span>/giờ</span></div>
            {!isActive && <span className={styles.statusNote}>{court.status === 'maintenance' ? 'Đang bảo trì' : 'Tạm ngừng hoạt động'}</span>}
          </button>
        )
      })}
    </div>
  )
}
