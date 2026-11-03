import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, AlertTriangle } from 'lucide-react'
import { loadLeaflet, TILE_URL, TILE_ATTR, DEFAULT_CENTER, formatPinPrice } from '@/utils/leaflet'
import { formatCurrency, getImageUrl } from '@/utils'
import styles from './VenueMap.module.css'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/**
 * Bản đồ kết quả tìm sân. Mỗi sân là một "ghim giá". Khi người dùng kéo/phóng to bản đồ,
 * hiện nút "Tìm trong khu vực này" để lọc theo khung nhìn hiện tại.
 */
export default function VenueMap({ venues, userPoint, autoFit, onSearchArea }) {
  const navigate = useNavigate()
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const userRef = useRef(null)
  const programmatic = useRef(0) // đếm các lần di chuyển do code (không tính là người dùng kéo)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [moved, setMoved] = useState(false)

  // Khởi tạo bản đồ 1 lần
  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then((L) => {
        if (cancelled || !elRef.current || mapRef.current) return
        const map = L.map(elRef.current, { center: DEFAULT_CENTER, zoom: 12, scrollWheelZoom: true })
        L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map)
        layerRef.current = L.layerGroup().addTo(map)
        map.on('movestart', () => { if (!programmatic.current) setMoved(true) })
        map.on('moveend', () => { programmatic.current = 0 })
        mapRef.current = map
        setReady(true)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // Vẽ lại ghim khi danh sách sân đổi
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!ready || !L || !map) return
    layerRef.current.clearLayers()
    const pts = []
    venues.forEach((v) => {
      if (typeof v.location?.lat !== 'number' || typeof v.location?.lng !== 'number') return
      const ll = [v.location.lat, v.location.lng]
      pts.push(ll)
      const price = v.minPricePerHour ?? 0
      const icon = L.divIcon({
        className: styles.pinWrap,
        html: `<span class="${styles.pin}">${formatPinPrice(price)}</span>`,
        iconSize: null,
        iconAnchor: [28, 30],
        popupAnchor: [0, -28],
      })
      const img = getImageUrl(v.images?.[0])
      const popup = `
        <a class="${styles.popup}" href="/venues/${esc(v._id)}">
          ${img ? `<img src="${esc(img)}" alt="" class="${styles.popupImg}" />` : ''}
          <strong class="${styles.popupName}">${esc(v.name)}</strong>
          <span class="${styles.popupMeta}">${esc(v.address?.district)}, ${esc(v.address?.city)}${typeof v.distanceKm === 'number' ? ` · ${v.distanceKm.toFixed(1)} km` : ''}</span>
          <span class="${styles.popupMeta}">★ ${(v.rating || 0).toFixed(1)} · từ ${esc(formatCurrency(price))}/giờ</span>
        </a>`
      L.marker(ll, { icon, riseOnHover: true }).bindPopup(popup, { minWidth: 190 }).addTo(layerRef.current)
    })
    if (autoFit && pts.length) {
      programmatic.current = 1
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 })
      setMoved(false)
    }
  }, [venues, ready, autoFit])

  // Chấm vị trí của người dùng
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!ready || !L || !map) return
    if (userRef.current) { userRef.current.remove(); userRef.current = null }
    if (userPoint) {
      userRef.current = L.circleMarker([userPoint.lat, userPoint.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#0A84FF', fillOpacity: 1 }).addTo(map)
      if (!venues.length) { programmatic.current = 1; map.setView([userPoint.lat, userPoint.lng], 13) }
    }
  }, [userPoint, ready, venues.length])

  // Link trong popup: chuyển trang kiểu SPA thay vì tải lại cả trang
  const onWrapClick = (e) => {
    const a = e.target.closest?.('a[href^="/venues/"]')
    if (a) { e.preventDefault(); navigate(a.getAttribute('href')) }
  }

  const searchHere = () => {
    const b = mapRef.current?.getBounds()
    if (!b) return
    onSearchArea({ swLat: b.getSouth(), swLng: b.getWest(), neLat: b.getNorth(), neLng: b.getEast() })
    setMoved(false)
  }

  if (error) {
    return <div className={styles.error}><AlertTriangle size={28} /><p>{error}</p></div>
  }

  return (
    <div className={styles.wrap} onClick={onWrapClick}>
      <div ref={elRef} className={styles.map} role="application" aria-label="Bản đồ sân thể thao" />
      {!ready && <div className={styles.loading}>Đang tải bản đồ…</div>}
      {ready && moved && (
        <button type="button" className={styles.searchBtn} onClick={searchHere}>
          <Search size={15} strokeWidth={2.5} /> Tìm trong khu vực này
        </button>
      )}
    </div>
  )
}
