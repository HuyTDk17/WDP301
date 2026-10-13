import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Ban, CalendarDays } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import { eventService, EVENT_TYPES, eventTypeLabel } from '@/services/eventService'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime, formatCurrency, toDateTimeLocal, fromDateTimeLocal, getImageUrl } from '@/utils'
import f from '@/components/dashboard/form.module.css'

const EMPTY = { venueId: '', title: '', type: 'tournament', description: '', highlight: '', price: '', startsAt: '', endsAt: '' }
const MAX_MB = 5
const TABS = [['', 'Tất cả'], ['upcoming', 'Sắp diễn ra'], ['ongoing', 'Đang diễn ra'], ['ended', 'Đã kết thúc'], ['cancelled', 'Đã hủy']]

export default function OwnerEvents() {
  const { toast } = useToast()
  const [events, setEvents] = useState([])
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('')

  const [editing, setEditing] = useState(null)      // null | {} (mới) | {_id,...}
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [filePreview, setFilePreview] = useState('')
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)

  const load = useCallback((phase) => {
    setLoading(true)
    eventService.getOwnerEvents({ phase: phase || undefined })
      .then((res) => setEvents(res.events || []))
      .catch(() => toast.error('Không thể tải danh sách sự kiện'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load('') }, [load])
  useEffect(() => { venueService.getOwnerVenues().then((res) => setVenues(res.venues || [])).catch(() => {}) }, [])

  useEffect(() => {
    if (!file) { setFilePreview(''); return undefined }
    const url = URL.createObjectURL(file)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const changeTab = (t) => { setTab(t); load(t) }

  const openForm = (ev) => {
    setFile(null); setRemoveImage(false)
    if (!ev) { setEditing({}); setForm({ ...EMPTY, venueId: venues[0]?._id || '' }); return }
    setEditing(ev)
    setForm({
      venueId: String(ev.venueId), title: ev.title, type: ev.type, description: ev.description, highlight: ev.highlight || '',
      price: ev.price || '', startsAt: toDateTimeLocal(ev.startsAt), endsAt: toDateTimeLocal(ev.endsAt),
    })
  }
  const closeForm = () => { if (!saving) setEditing(null) }
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))

  const pickFile = (e) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    if (picked.size > MAX_MB * 1024 * 1024) { toast.error(`Ảnh lớn hơn ${MAX_MB}MB`); return }
    setFile(picked); setRemoveImage(false)
  }

  const isNew = !editing?._id
  const titleOk = form.title.trim().length >= 5
  const descOk = form.description.trim().length >= 20
  const datesOk = form.startsAt && form.endsAt && new Date(form.endsAt) > new Date(form.startsAt)
  const priceOk = form.price === '' || (Number.isInteger(Number(form.price)) && Number(form.price) >= 0)
  const canSave = form.venueId && titleOk && descOk && datesOk && priceOk && !saving

  const save = async () => {
    const data = new FormData()
    data.append('venueId', form.venueId)
    data.append('title', form.title.trim())
    data.append('type', form.type)
    data.append('description', form.description.trim())
    data.append('highlight', form.highlight.trim())
    data.append('price', form.price === '' ? 0 : form.price)
    data.append('startsAt', fromDateTimeLocal(form.startsAt))
    data.append('endsAt', fromDateTimeLocal(form.endsAt))
    if (file) data.append('image', file)
    if (removeImage) data.append('removeImage', 'true')
    setSaving(true)
    try {
      if (isNew) await eventService.createEvent(data)
      else await eventService.updateEvent(editing._id, data)
      toast.success(isNew ? 'Đã tạo sự kiện' : 'Đã cập nhật sự kiện')
      setEditing(null)
      load(tab)
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu sự kiện')
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (reason) => {
    try {
      await eventService.cancelEvent(cancelTarget._id, reason)
      toast.success('Đã hủy sự kiện')
      setCancelTarget(null)
      load(tab)
    } catch (err) {
      toast.error(err?.message || 'Không thể hủy sự kiện')
    }
  }

  const columns = [
    { header: 'Sự kiện', accessor: 'title', render: (v, e) => (<div><p className={f.cellTitle}>{v}</p><p className={f.cellSub}>{eventTypeLabel(e.type)} · {e.venueName}</p></div>) },
    { header: 'Thời gian', accessor: 'startsAt', render: (_, e) => <span className={f.cellSub}>{formatDateTime(e.startsAt)} → {formatDateTime(e.endsAt)}</span> },
    { header: 'Phí tham gia', accessor: 'price', render: (v) => <span className={f.cellSub}>{v ? formatCurrency(v) : 'Miễn phí'}</span> },
    { header: 'Trạng thái', accessor: 'phase', render: (v) => <StatusBadge status={v} /> },
  ]
  const editable = (e) => ['upcoming', 'ongoing'].includes(e.phase)
  const shownImage = filePreview || (removeImage ? '' : (editing?.imageUrl ? getImageUrl(editing.imageUrl) : ''))

  return (
    <div>
      <PageHeader title="Sự kiện" subtitle="Tạo giải đấu, chương trình khuyến mãi để thu hút khách. Sự kiện hiển thị công khai ở trang Sự kiện và trang địa điểm; hệ thống không nhận đăng ký hay thu phí tham gia." />
      <div className={f.tabs}>
        {TABS.map(([val, label]) => <button key={val} type="button" className={`${f.tab} ${tab === val ? f.tabActive : ''}`} onClick={() => changeTab(val)}>{label}</button>)}
      </div>
      <DataTable
        columns={columns}
        data={events}
        loading={loading}
        pageSize={8}
        searchPlaceholder="Tìm sự kiện..."
        emptyText="Chưa có sự kiện nào"
        emptyIcon={<CalendarDays size={40} />}
        headerRight={<Button icon={<Plus size={15} />} onClick={() => openForm()} disabled={venues.length === 0}>Tạo sự kiện</Button>}
        actions={(row) => editable(row) ? (
          <>
            <Button size="xs" variant="outline" icon={<Pencil size={13} />} onClick={() => openForm(row)}>Sửa</Button>
            <Button size="xs" variant="danger" icon={<Ban size={13} />} onClick={() => setCancelTarget(row)}>Hủy</Button>
          </>
        ) : null}
      />

      <Modal isOpen={!!editing} onClose={closeForm} title={isNew ? 'Tạo sự kiện' : 'Sửa sự kiện'} size="lg" footer={
        <>
          <Button variant="outline" onClick={closeForm} disabled={saving}>Đóng</Button>
          <Button onClick={save} loading={saving} disabled={!canSave}>{isNew ? 'Tạo sự kiện' : 'Lưu thay đổi'}</Button>
        </>
      }>
        <div className={f.form}>
          <div className={f.row}>
            <label className={f.field}>
              <span className={f.label}>Địa điểm tổ chức <em>*</em></span>
              <select className={f.control} value={form.venueId} onChange={set('venueId')}>
                {venues.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </label>
            <label className={f.field}>
              <span className={f.label}>Loại sự kiện</span>
              <select className={f.control} value={form.type} onChange={set('type')}>
                {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <label className={f.field}>
            <span className={f.label}>Tên sự kiện <em>*</em></span>
            <input className={f.control} value={form.title} onChange={set('title')} maxLength={120} placeholder="Ví dụ: Giải bóng đá mini mùa thu" />
            {form.title && !titleOk && <span className={f.error}>Tên cần ít nhất 5 ký tự</span>}
          </label>
          <label className={f.field}>
            <span className={f.label}>Dòng nổi bật (hiện trên thẻ)</span>
            <input className={f.control} value={form.highlight} onChange={set('highlight')} maxLength={60} placeholder="Ví dụ: Giảm 20% giờ vàng" />
          </label>
          <label className={f.field}>
            <span className={f.label}>Mô tả <em>*</em></span>
            <textarea className={f.control} rows={5} value={form.description} onChange={set('description')} maxLength={3000} placeholder="Thể thức, đối tượng, cách tham gia, liên hệ..." />
            <span className={descOk || !form.description ? f.hint : f.error}>{form.description.trim().length}/3000 · tối thiểu 20 ký tự</span>
          </label>
          <div className={f.row}>
            <label className={f.field}>
              <span className={f.label}>Bắt đầu <em>*</em></span>
              <input className={f.control} type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Kết thúc <em>*</em></span>
              <input className={f.control} type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
              {form.startsAt && form.endsAt && !datesOk && <span className={f.error}>Phải sau thời gian bắt đầu</span>}
            </label>
          </div>
          <label className={f.field}>
            <span className={f.label}>Phí tham gia (đ) — chỉ để thông tin</span>
            <input className={f.control} type="number" min="0" step="1000" value={form.price} onChange={set('price')} placeholder="Để trống = miễn phí" />
            {!priceOk && <span className={f.error}>Phí phải là số nguyên không âm</span>}
          </label>
          <div className={f.field}>
            <span className={f.label}>Ảnh sự kiện</span>
            {shownImage && <img className={f.preview} src={shownImage} alt="Ảnh sự kiện" />}
            <input className={f.control} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile} />
            {editing?.imageUrl && !file && <label className={f.check}><input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} /> Gỡ ảnh hiện tại</label>}
          </div>
        </div>
      </Modal>

      <ReasonModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancel}
        title="Hủy sự kiện"
        description={`Hủy sự kiện "${cancelTarget?.title}"? Sự kiện sẽ hiện là "Đã hủy" ở trang công khai và không thể mở lại hay chỉnh sửa.`}
        confirmLabel="Hủy sự kiện"
        reasonLabel="Lý do hủy"
        reasonPlaceholder="Ví dụ: Không đủ số đội đăng ký, dời sang tháng sau..."
      />
    </div>
  )
}
