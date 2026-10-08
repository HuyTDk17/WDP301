import { Search, X } from 'lucide-react'
import styles from './SearchFilter.module.css'

export default function SearchFilter({ value, onChange, placeholder = 'Tìm kiếm...', filters = [], children }) {
  return (
    <div className={styles.bar}>
      {onChange && (
        <div className={styles.searchWrap}>
          <span className={styles.icon}><Search size={15} /></span>
          <input className={styles.input} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
          {value && <button className={styles.clear} onClick={() => onChange('')}><X size={13} /></button>}
        </div>
      )}
      {filters.map((f, i) => (
        <select key={i} className={styles.select} value={f.value} onChange={e => f.onChange(e.target.value)}>
          <option value="">{f.placeholder}</option>
          {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {children}
    </div>
  )
}
