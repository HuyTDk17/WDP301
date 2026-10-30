import { useEffect, useRef, useState } from 'react'
import { Search, LocateFixed, X } from 'lucide-react'
import { loadLeaflet, TILE_URL, TILE_ATTR, DEFAULT_CENTER, geocodeAddress } from '@/utils/leaflet'
import styles from './MapPicker.module.css'

/**
 * Chủ sân chọn vị trí sân trên bản đồ: bấm vào bản đồ, kéo ghim, hoặc tìm theo địa chỉ.
 * value = { lat, lng } | null ; onChange nhận { lat, lng } | null
 */
export default function MapPicker({ value, onChange, addressText }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then((L) => {
        if (cancelled || !elRef.current || mapRef.current) return
        const start = value ? [value.lat, value.lng] : DEFAULT_CENTER
        const map = L.map(elRef.current, { center: start, zoom: value ? 16 : 12 })
        L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map)
        map.on('click', (e) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
        mapRef.current = map
        setReady(true)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Đồng bộ ghim với value
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!ready || !L || !map) return
    if (!value) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
      return
    }
    const ll = [value.lat, value.lng]
    if (!markerRef.current) {
      markerRef.current = L.marker(ll, { draggable: true }).addTo(map)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng()
        onChangeRef.current({ lat: p.lat, lng: p.lng })
      })
    } else {
      markerRef.current.setLatLng(ll)
    }
  }, [value, ready])

  const flyTo = (lat, lng, zoom = 16) => mapRef.current?.setView([lat, lng], zoom)

  const findAddress = async () => {
    if (!addressText?.trim()) { setNote('Hãy nhập địa chỉ ở trên trước.'); return }
    setBusy(true); setNote('')
    try {
      // Thử đầy đủ trước, nếu không ra thì thử bỏ số nhà (chỉ quận + thành phố)
      let r = await geocodeAddress(addressText)
      if (!r) {
        const parts = addressText.split(',').map((s) => s.trim()).filter(Boolean)
        if (parts.length > 1) r = await geocodeAddress(parts.slice(1).join(', '))
        if (r) setNote('Chưa tìm thấy chính xác số nhà, đã đặt ghim gần khu vực — hãy kéo ghim đến đúng vị trí sân.')
      } else setNote('Đã đặt ghim theo địa chỉ. Kéo ghim nếu cần chỉnh cho đúng.')
      if (!r) { setNote('Không tìm thấy địa chỉ này. Hãy bấm trực tiếp lên bản đồ để chọn vị trí.'); return }
      onChange({ lat: r.lat, lng: r.lng })
      flyTo(r.lat, r.lng)
    } catch (e) {
      setNote(e.message || 'Không tìm được địa chỉ')
    } finally { setBusy(false) }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { setNote('Trình duyệt không hỗ trợ định vị.'); return }
    setBusy(true); setNote('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }); flyTo(pos.coords.latitude, pos.coords.longitude); setBusy(false) },
      () => { setNote('Không lấy được vị trí. Hãy cho phép truy cập vị trí hoặc bấm lên bản đồ.'); setBusy(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  if (error) return <p className={styles.error}>{error}</p>

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.btn} onClick={findAddress} disabled={busy || !ready}><Search size={14} /> Tìm theo địa chỉ</button>
        <button type="button" className={styles.btn} onClick={useMyLocation} disabled={busy || !ready}><LocateFixed size={14} /> Vị trí của tôi</button>
        {value && <button type="button" className={styles.btnGhost} onClick={() => onChange(null)}><X size={14} /> Bỏ ghim</button>}
      </div>
      <div ref={elRef} className={styles.map} />
      <p className={styles.hint}>
        {value ? `Đã chọn: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Chưa chọn vị trí. Bấm lên bản đồ để đặt ghim — khách sẽ tìm thấy sân của bạn trên bản đồ.'}
      </p>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  )
}
