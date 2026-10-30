import { useMemo, useState } from 'react'
import { matchesQuery, toDateKey } from '@/utils/search'

/**
 * Lọc + tìm kiếm phía client cho các danh sách dạng thẻ (không dùng DataTable).
 *
 *   const f = useListFilters(items, {
 *     searchText: (it) => `${it.name} ${it.code}`,          // chuỗi để tìm kiếm (không phân biệt dấu)
 *     filters: { status: (it, v) => it.status === v },       // mỗi bộ lọc: (item, giá trị) => boolean
 *     dateField: (it) => it.createdAt,                       // (tùy chọn) bật lọc theo khoảng ngày
 *   })
 *   f.filtered, f.search/setSearch, f.values/setValue(key, v), f.from/to + setFrom/setTo, f.active, f.clear
 */
export default function useListFilters(items, { searchText, filters = {}, dateField } = {}) {
  const [search, setSearch] = useState('')
  const [values, setValues] = useState({})
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => (items || []).filter((it) => {
    if (search && !matchesQuery(searchText ? searchText(it) : '', search)) return false
    for (const [key, fn] of Object.entries(filters)) {
      const v = values[key]
      if (v && !fn(it, v)) return false
    }
    if (dateField && (from || to)) {
      const d = toDateKey(dateField(it))
      if (!d || (from && d < from) || (to && d > to)) return false
    }
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items, search, values, from, to])

  const active = !!(search || from || to || Object.values(values).some(Boolean))
  const clear = () => { setSearch(''); setValues({}); setFrom(''); setTo('') }
  const setValue = (key, v) => setValues((s) => ({ ...s, [key]: v }))

  return { filtered, search, setSearch, values, setValue, from, to, setFrom, setTo, active, clear, hasDate: !!dateField }
}
