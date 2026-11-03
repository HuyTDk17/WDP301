// Tải Leaflet từ CDN khi cần (chỉ trang có bản đồ mới tải), dùng chung 1 lần.
const VERSION = '1.9.4'
const BASE = `https://unpkg.com/leaflet@${VERSION}/dist`

let promise = null

export function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.L) return Promise.resolve(window.L)
  if (promise) return promise

  promise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = `${BASE}/leaflet.css`
      css.setAttribute('data-leaflet', '1')
      document.head.appendChild(css)
    }
    const script = document.createElement('script')
    script.src = `${BASE}/leaflet.js`
    script.async = true
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet không khả dụng')))
    script.onerror = () => {
      promise = null // cho phép thử lại
      script.remove()
      reject(new Error('Không tải được bản đồ. Kiểm tra kết nối mạng rồi thử lại.'))
    }
    document.head.appendChild(script)
  })
  return promise
}

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
// Tâm mặc định: Hà Nội
export const DEFAULT_CENTER = [21.0285, 105.8542]

export function formatPinPrice(v) {
  if (!v) return '—'
  if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 ? 1 : 0)}tr`
  return `${Math.round(v / 1000)}K`
}

/** Tìm toạ độ theo địa chỉ bằng Nominatim (OpenStreetMap), giới hạn trong Việt Nam. */
export async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Dịch vụ tìm địa chỉ đang bận, hãy thử lại sau')
  const data = await res.json()
  if (!data.length) return null
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name }
}
