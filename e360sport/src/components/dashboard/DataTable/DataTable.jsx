import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, ArrowUp, ArrowDown, ArrowUpDown, Inbox } from 'lucide-react'
import styles from './DataTable.module.css'

// `server` (tùy chọn) — bật chế độ phân trang/tìm kiếm PHÍA BACKEND thay vì lọc/
// cắt trang trên toàn bộ dữ liệu ở client. Khi truyền `server`, `data` chỉ nên
// chứa đúng các dòng của TRANG HIỆN TẠI (đã lọc sẵn từ server), không phải toàn
// bộ dữ liệu. Shape: { page, totalPages, total, onPageChange, onSearchChange }
export default function DataTable({ columns = [], data = [], loading = false, emptyText = 'Không có dữ liệu', emptyIcon = <Inbox size={40} />, searchable = true, searchPlaceholder = 'Tìm kiếm...', pageSize = 8, actions, rowKey = '_id', onRowClick, title, headerRight, server = null }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const debounceRef = useRef(null)

  const filtered = useMemo(() => {
    if (server) return data // đã được server lọc/phân trang sẵn
    let rows = [...data]
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(row => columns.some(col => {
        const val = col.accessor ? row[col.accessor] : null
        return val && String(val).toLowerCase().includes(q)
      }))
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
  }, [data, search, sortKey, sortDir, columns, server])

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
      {(title || searchable || headerRight) && (
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
