import { X } from 'lucide-react'
import SearchFilter from '@/components/dashboard/SearchFilter/SearchFilter'
import styles from './ListFilterBar.module.css'

// Thanh tìm kiếm + lọc cho danh sách dạng thẻ. `f` là kết quả của useListFilters.
// filters: [{ key, placeholder, options:[{value,label}] }]
export default function ListFilterBar({ f, placeholder = 'Tìm kiếm...', filters = [], dateLabel = 'Ngày', total, shown }) {
  return (
    <div className={styles.wrap}>
      <SearchFilter
        value={f.search}
        onChange={f.setSearch}
        placeholder={placeholder}
        filters={filters.map((x) => ({ placeholder: x.placeholder, options: x.options, value: f.values[x.key] || '', onChange: (v) => f.setValue(x.key, v) }))}
      >
        {f.hasDate && (
          <label className={styles.date}>
            <span>{dateLabel}</span>
            <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => f.setFrom(e.target.value)} />
            <span>→</span>
            <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => f.setTo(e.target.value)} />
          </label>
        )}
        {f.active && <button type="button" className={styles.clear} onClick={f.clear}><X size={12} /> Xóa lọc</button>}
      </SearchFilter>
      {f.active && total !== undefined && <p className={styles.count}>Hiển thị {shown ?? f.filtered.length}/{total} mục</p>}
    </div>
  )
}
