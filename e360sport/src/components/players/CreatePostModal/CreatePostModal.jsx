import { useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import { playerService, LEVELS } from '@/services/playerService'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { formatDate, formatTime, getSport } from '@/utils'
import f from '@/components/dashboard/form.module.css'

/** Đăng bài "tìm thêm người" cho một lượt đặt đã xác nhận. Máy chủ kiểm tra lại mọi điều kiện. */
export default function CreatePostModal({ booking, isOpen, onClose, onCreated }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [slots, setSlots] = useState(2)
  const [level, setLevel] = useState('any')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const noPhone = !user?.phone
  const slotsOk = Number.isInteger(Number(slots)) && Number(slots) >= 1 && Number(slots) <= 20
  const canSave = !!booking && slotsOk && !noPhone && !saving

  const submit = async () => {
    setSaving(true)
    try {
      await playerService.createPost({ bookingId: booking._id, slotsNeeded: Number(slots), level, note: note.trim() })
      toast.success('Đã đăng bài tìm người chơi')
      onCreated?.()
    } catch (err) {
      toast.error(err?.message || 'Không thể đăng bài')
    } finally {
      setSaving(false)
    }
  }

  const sport = booking ? getSport(booking.sport) : null

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} title="Tìm thêm người chơi" footer={
      <>
        <Button variant="outline" onClick={onClose} disabled={saving}>Hủy</Button>
        <Button onClick={submit} loading={saving} disabled={!canSave}>Đăng bài</Button>
      </>
    }>
      {booking && (
        <div className={f.form}>
          <p className={f.hint}>
            {sport ? `${sport.icon} ${sport.name} · ` : ''}{booking.venueName} · {booking.courtName}<br />
            {formatDate(booking.date)} · {formatTime(booking.startTime)}–{formatTime(booking.endTime)}
          </p>
          {noPhone && (
            <p className={f.error}>Bạn cần cập nhật số điện thoại trong <Link to="/profile">Hồ sơ</Link> để hai bên liên lạc được sau khi ghép nhóm.</p>
          )}
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
            <span className={f.label}>Ghi chú</span>
            <textarea className={f.control} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Đá giao lưu vui vẻ, chia đều tiền sân, mang giày đinh dăm." />
            <span className={f.hint}>{note.length}/300 · Số điện thoại của bạn chỉ được chia sẻ với người bạn đồng ý nhận vào nhóm.</span>
          </label>
        </div>
      )}
    </Modal>
  )
}
