import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import { playerService, LEVELS } from '@/services/playerService'
import { venueService } from '@/services/venueService'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { getSport, toLocalISODate } from '@/utils'
import f from '@/components/dashboard/form.module.css'

/**
 * Đăng bài "tìm người chơi" ngay ở trang Tìm người chơi — KHÔNG cần có lượt đặt sân trước.
 * Chọn địa điểm → sân → ngày giờ → nội dung. Bài đăng thẳng chưa gắn lượt đặt (nhóm tự đặt sân),
 * máy chủ kiểm tra lại mọi điều kiện.
 *
 * Mở bằng cách render có điều kiện ({open && <NewPostModal />}) để mỗi lần mở là một form mới.
 */
export default function NewPostModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [venueQuery, setVenueQuery] = useState('')
  const [venues, setVenues] = useState([])
  const [venuesLoading, setVenuesLoading] = useState(true)
  const [venueId, setVenueId] = useState('')
  const [courts, setCourts] = useState([])
  const [courtsLoading, setCourtsLoading] = useState(false)
  const [courtId, setCourtId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [slots, setSlots] = useState(2)
  const [level, setLevel] = useState('any')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Danh sách địa điểm (tìm theo tên, chờ người dùng ngừng gõ một chút)
  useEffect(() => {
    let cancelled = false
    setVenuesLoading(true)
    const t = setTimeout(() => {
      venueService.getVenues({ search: venueQuery.trim() || undefined, limit: 30 })
        .then((res) => { if (!cancelled) setVenues(res.venues || []) })
        .catch(() => { if (!cancelled) { setVenues([]); toast.error('Không thể tải danh sách địa điểm') } })
        .finally(() => { if (!cancelled) setVenuesLoading(false) })
    }, venueQuery ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [venueQuery])

  // Sân của địa điểm đang chọn (chỉ sân đang hoạt động)
  const pickVenue = (id) => {
    setVenueId(id)
    setCourtId('')
    setCourts([])
    if (!id) return
    setCourtsLoading(true)
    venueService.getVenueById(id)
      .then((res) => setCourts((res.venue?.courts || []).filter((c) => c.status === 'active')))
      .catch(() => toast.error('Không thể tải danh sách sân'))
      .finally(() => setCourtsLoading(false))
  }

  const noPhone = !user?.phone
  const slotsOk = Number.isInteger(Number(slots)) && Number(slots) >= 1 && Number(slots) <= 20
  const timeOk = !!startTime && !!endTime && endTime > startTime
  const canSave = !!venueId && !!courtId && !!date && timeOk && slotsOk && !noPhone && !saving

  const submit = async () => {
    setSaving(true)
    try {
      await playerService.createPost({ venueId, courtId, date, startTime, endTime, slotsNeeded: Number(slots), level, note: note.trim() })
      toast.success('Đã đăng bài tìm người chơi')
      onCreated?.()
    } catch (err) {
      toast.error(err?.message || 'Không thể đăng bài')
    } finally {
      setSaving(false)
    }
  }

  const court = courts.find((c) => c._id === courtId)
  const sport = court ? getSport(court.type) : null

  return (
    <Modal isOpen onClose={saving ? () => {} : onClose} title="Đăng bài tìm người chơi" footer={
      <>
        <Button variant="outline" onClick={onClose} disabled={saving}>Hủy</Button>
        <Button onClick={submit} loading={saving} disabled={!canSave}>Đăng bài</Button>
      </>
    }>
      <div className={f.form}>
        {noPhone && (
          <p className={f.error}>Bạn cần cập nhật số điện thoại trong <Link to="/profile">Hồ sơ</Link> để hai bên liên lạc được sau khi ghép nhóm.</p>
        )}

        <label className={f.field}>
          <span className={f.label}>Địa điểm <em>*</em></span>
          <input className={f.control} type="search" value={venueQuery} onChange={(e) => setVenueQuery(e.target.value)} placeholder="Gõ tên địa điểm để tìm..." />
          <select className={f.control} value={venueId} onChange={(e) => pickVenue(e.target.value)} disabled={venuesLoading && venues.length === 0}>
            <option value="">{venuesLoading ? 'Đang tải...' : venues.length ? '— Chọn địa điểm —' : 'Không tìm thấy địa điểm nào'}</option>
            {venues.map((v) => <option key={v._id} value={v._id}>{v.name}{v.address?.district ? ` · ${v.address.district}` : ''}</option>)}
          </select>
        </label>

        <label className={f.field}>
          <span className={f.label}>Sân <em>*</em></span>
          <select className={f.control} value={courtId} onChange={(e) => setCourtId(e.target.value)} disabled={!venueId || courtsLoading}>
            <option value="">{!venueId ? 'Chọn địa điểm trước' : courtsLoading ? 'Đang tải...' : courts.length ? '— Chọn sân —' : 'Địa điểm này chưa có sân đang hoạt động'}</option>
            {courts.map((c) => {
              const s = getSport(c.type)
              return <option key={c._id} value={c._id}>{c.name}{s ? ` · ${s.icon} ${s.name}` : ''}</option>
            })}
          </select>
          {sport && <span className={f.hint}>Môn: {sport.icon} {sport.name}</span>}
        </label>

        <div className={f.row}>
          <label className={f.field}>
            <span className={f.label}>Ngày chơi <em>*</em></span>
            <input className={f.control} type="date" min={toLocalISODate()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className={f.row}>
            <label className={f.field}>
              <span className={f.label}>Từ <em>*</em></span>
              <input className={f.control} type="time" step="1800" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Đến <em>*</em></span>
              <input className={f.control} type="time" step="1800" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
        </div>
        {startTime && endTime && !timeOk && <span className={f.error}>Giờ kết thúc phải sau giờ bắt đầu</span>}

        <div className={f.row}>
          <label className={f.field}>
            <span className={f.label}>Cần thêm bao nhiêu người? <em>*</em></span>
            <input className={f.control} type="number" min="1" max="20" value={slots} onChange={(e) => setSlots(e.target.value)} />
            {!slotsOk && <span className={f.error}>Từ 1 đến 20 người</span>}
          </label>
          <label className={f.field}>
            <span className={f.label}>Trình độ mong muốn</span>
            <select className={f.control} value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
        </div>

        <label className={f.field}>
          <span className={f.label}>Nội dung tìm người</span>
          <textarea className={f.control} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Đá giao lưu vui vẻ, chia đều tiền sân, mang giày đinh dăm." />
          <span className={f.hint}>{note.length}/300 · Số điện thoại của bạn chỉ được chia sẻ với người bạn đồng ý nhận vào nhóm.</span>
        </label>

        <p className={f.hint}>Bài này chưa gắn với lượt đặt sân nào — nhóm sẽ tự đặt sân. Người xem sẽ thấy nhãn “Chưa đặt sân”.</p>
      </div>
    </Modal>
  )
}
