import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, ArrowUp, ArrowDown, ArrowUpDown, Inbox, X } from 'lucide-react'
import { matchesQuery, toDateKey } from '@/utils/search'
import styles from './DataTable.module.css'

// `server` (tùy chọn) — bật chế độ phân trang/tìm kiếm PHÍA BACKEND thay vì lọc/
// cắt trang trên toàn bộ dữ liệu ở client. Khi truyền `server`, `data` chỉ nên
// chứa đúng các dòng của TRANG HIỆN TẠI (đã lọc sẵn từ server), không phải toàn
// bộ dữ liệu. Shape: { page, totalPages, total, onPageChange, onSearchChange }
//
// `filters` (tùy chọn) — các bộ lọc hiện thành một hàng dưới ô tìm kiếm:
//   { key, placeholder, options:[{value,label}] }                 lọc theo row[key] === value
//   { key, placeholder, options, match:(row,value)=>boolean }     tự định nghĩa cách khớp
//   { key, type:'dateRange', label, getValue:(row)=>ngày }        lọc theo khoảng ngày
// Không truyền `value/onChange` → DataTable tự giữ trạng thái và lọc ở client.
// Có `value/onChange` (dateRange: value={from,to}) → trang tự điều khiển (dùng cho server mode).
// Cột có thể khai báo `searchValue: (row) => chuỗi` để tìm trên dữ liệu suy ra/lồng nhau.
// Tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt.
export default function DataTable({ columns = [], data = [], loading = false, emptyText = 'Không có dữ liệu', emptyIcon = <Inbox size={40} />, searchable = true, searchPlaceholder = 'Tìm kiếm...', pageSize = 8, actions, rowKey = '_id', onRowClick, title, headerRight, server = null, filters = [], onClearFilters }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [filterState, setFilterState] = useState({})
  const debounceRef = useRef(null)

  const filterValue = (f) => (f.onChange ? f.value : filterState[f.key])
  const setFilterValue = (f, v) => {
    if (f.onChange) f.onChange(v)
    else { setFilterState((st) => ({ ...st, [f.key]: v })); setPage(1) }
  }
  const isActiveFilter = (f) => {
    const v = filterValue(f)
    return f.type === 'dateRange' ? !!(v && (v.from || v.to)) : !!v
  }
  const activeCount = filters.filter(isActiveFilter).length + (search ? 1 : 0)
  const clearAll = () => {
    setSearch('')
    setFilterState({})
    setPage(1)
    filters.forEach((f) => { if (f.onChange && isActiveFilter(f)) f.onChange(f.type === 'dateRange' ? { from: '', to: '' } : '') })
    if (server && search) server.onSearchChange?.('')
    onClearFilters?.()
  }

  const filtered = useMemo(() => {
    if (server) return data // đã được server lọc/phân trang sẵn
    let rows = [...data]
    // Bộ lọc do DataTable tự giữ (chỉ các bộ lọc không có onChange)
    filters.forEach((f) => {
      if (f.onChange) return
      const v = filterState[f.key]
      if (f.type === 'dateRange') {
        if (!v || (!v.from && !v.to)) return
        rows = rows.filter((row) => {
          const d = toDateKey(f.getValue ? f.getValue(row) : row[f.key])
          if (!d) return false
          return (!v.from || d >= v.from) && (!v.to || d <= v.to)
        })
      } else if (v) {
        rows = rows.filter((row) => (f.match ? f.match(row, v) : String(row[f.key]) === String(v)))
      }
    })
    if (search) {
      rows = rows.filter((row) => matchesQuery(columns.map((col) => {
        if (col.searchValue) return col.searchValue(row)
        const val = col.accessor ? row[col.accessor] : null
        return val !== null && typeof val === 'object' ? '' : val
      }), search))
    }
    if (sortKey) {
      rows.sort((a, b) => {
        const va = a[sortKey]; const vb = b[sortKey]
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return rows
  }, [data, search, sortKey, sortDir, columns, server, filters, filterState])

  const totalPages = server ? Math.max(1, server.totalPages) : Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = server ? server.page : page
  const paginated = server ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize)
  const resultCount = server ? (server.total ?? filtered.length) : filtered.length

  const handleSort = (key) => {
    if (!key || server) return // sắp xếp phía client bị vô hiệu khi đã bật server mode
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  const handleSearch = (e) => {
    const value = e.target.value
    setSearch(value)
    if (server) {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => server.onSearchChange?.(value), 350)
    } else {
      setPage(1)
    }
  }

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const goToPage = (p) => {
    if (server) server.onPageChange?.(p)
    else setPage(p)
  }

  return (
    <div className={styles.wrapper}>
      {(title || searchable || headerRight || filters.length > 0) && (
        <div className={styles.tableHeader}>
          {title && <h3 className={styles.tableTitle}>{title}</h3>}
          <div className={styles.headerRight}>
            {headerRight}
            {searchable && (
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><Search size={15} /></span>
                <input className={styles.search} placeholder={searchPlaceholder} value={search} onChange={handleSearch} />
              </div>
            )}
          </div>
        </div>
      )}

      {filters.length > 0 && (
        <div className={styles.filterBar}>
          {filters.map((f) => f.type === 'dateRange' ? (
            <label key={f.key} className={styles.dateFilter}>
              <span>{f.label || 'Ngày'}</span>
              <input type="date" value={filterValue(f)?.from || ''} max={filterValue(f)?.to || undefined} onChange={(e) => setFilterValue(f, { ...(filterValue(f) || {}), from: e.target.value })} />
              <span>→</span>
              <input type="date" value={filterValue(f)?.to || ''} min={filterValue(f)?.from || undefined} onChange={(e) => setFilterValue(f, { ...(filterValue(f) || {}), to: e.target.value })} />
            </label>
          ) : (
            <select key={f.key} className={styles.filterSelect} value={filterValue(f) || ''} onChange={(e) => setFilterValue(f, e.target.value)} aria-label={f.placeholder}>
              <option value="">{f.placeholder}</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {activeCount > 0 && <button type="button" className={styles.clearFilters} onClick={clearAll}><X size={12} /> Xóa lọc</button>}
        </div>
      )}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} className={`${styles.th} ${col.sortable && !server ? styles.sortable : ''}`} style={{ width: col.width }} onClick={() => col.sortable && handleSort(col.accessor)}>
                  {col.header}
                  {col.sortable && !server && <span className={styles.sortIcon}>{sortKey === col.accessor ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}</span>}
                </th>
              ))}
              {actions && <th className={styles.th} style={{ width: 120 }}>Hành động</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: server?.pageSize || pageSize }, (_, i) => (
                <tr key={i} className={styles.skeletonRow}>
                  {columns.map((_, j) => <td key={j} className={styles.td}><div className={styles.skeletonCell} /></td>)}
                  {actions && <td className={styles.td}><div className={styles.skeletonCell} /></td>}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className={styles.emptyCell}>
                  <div className={styles.empty}><span className={styles.emptyIcon}>{emptyIcon}</span><p>{emptyText}</p></div>
                </td>
              </tr>
            ) : (
              paginated.map(row => (
                <tr key={row[rowKey]} className={`${styles.tr} ${onRowClick ? styles.clickableRow : ''}`} onClick={() => onRowClick?.(row)}>
                  {columns.map((col, j) => <td key={j} className={styles.td}>{col.render ? col.render(row[col.accessor], row) : row[col.accessor]}</td>)}
                  {actions && <td className={styles.td} onClick={e => e.stopPropagation()}><div className={styles.actionCell}>{actions(row)}</div></td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>{resultCount} kết quả · Trang {currentPage}/{totalPages}</span>
          <div className={styles.paginationBtns}>
            <button className={styles.pageBtn} disabled={currentPage === 1} onClick={() => goToPage(1)}>«</button>
            <button className={styles.pageBtn} disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i
              return p <= totalPages ? <button key={p} className={`${styles.pageBtn} ${p === currentPage ? styles.pageBtnActive : ''}`} onClick={() => goToPage(p)}>{p}</button> : null
            })}
            <button className={styles.pageBtn} disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)}>›</button>
            <button className={styles.pageBtn} disabled={currentPage === totalPages} onClick={() => goToPage(totalPages)}>»</button>
          </div>
        </div>
      )}
    </div>
  )
}
