// Chuẩn hoá chuỗi để tìm kiếm: bỏ dấu tiếng Việt, đ→d, chữ thường.
// "Nguyễn Văn Đạt" khớp với "nguyen van dat".
export function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

// true nếu MỌI từ trong `query` đều xuất hiện trong ít nhất một trường của `haystack`
export function matchesQuery(haystack, query) {
  const q = normalizeText(query)
  if (!q) return true
  const text = normalizeText(Array.isArray(haystack) ? haystack.join(' ') : haystack)
  return q.split(/\s+/).every((w) => text.includes(w))
}

// Lấy ngày YYYY-MM-DD (so sánh chuỗi được) từ giá trị ngày bất kỳ
export function toDateKey(v) {
  if (!v) return ''
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
