import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Image as ImageIcon } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import { contentService } from '@/services/contentService'
import { useToast } from '@/contexts/ToastContext'
import { formatDate, getImageUrl } from '@/utils'
import f from '@/components/dashboard/form.module.css'

const EMPTY = { title: '', subtitle: '', linkUrl: '', order: 0, isActive: true, startsAt: '', endsAt: '' }
const MAX_MB = 5

// ISO (UTC) ↔ giá trị của <input type="datetime-local"> (giờ máy người dùng)
const toInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromInput = (v) => (v ? new Date(v).toISOString() : '')

export default function BannerManagement() {
  const { toast } = useToast()
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)       // null = đóng, {} = tạo mới, {_id,...} = sửa
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    contentService.adminGetBanners()
      .then((res) => setBanners(res.banners || []))
      .catch(() => toast.error('Không thể tải danh sách banner'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!file) return undefined
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const openForm = (banner = {}) => {
    setEditing(banner)
    setFile(null)
    setPreview(banner.imageUrl ? getImageUrl(banner.imageUrl) : '')
    setForm(banner._id ? {
      title: banner.title, subtitle: banner.subtitle || '', linkUrl: banner.linkUrl || '', order: banner.order ?? 0,
      isActive: banner.isActive !== false, startsAt: toInput(banner.startsAt), endsAt: toInput(banner.endsAt),
    } : EMPTY)
  }
  const closeForm = () => { if (!saving) setEditing(null) }
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const pickFile = (e) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    if (picked.size > MAX_MB * 1024 * 1024) { toast.error(`Ảnh lớn hơn ${MAX_MB}MB`); return }
    setFile(picked)
  }

  const isNew = !editing?._id
  const linkOk = !form.linkUrl || /^(\/(?!\/)\S*|https?:\/\/\S+)$/i.test(form.linkUrl)
  const datesOk = !form.startsAt || !form.endsAt || new Date(form.endsAt) > new Date(form.startsAt)
  const canSave = form.title.trim() && linkOk && datesOk && (!isNew || file) && !saving

  const save = async () => {
    const data = new FormData()
    data.append('title', form.title.trim())
    data.append('subtitle', form.subtitle.trim())
    data.append('linkUrl', form.linkUrl.trim())
    data.append('order', form.order)
    data.append('isActive', form.isActive)
    data.append('startsAt', fromInput(form.startsAt))
    data.append('endsAt', fromInput(form.endsAt))
    if (file) data.append('image', file)
    setSaving(true)
    try {
      if (isNew) await contentService.adminCreateBanner(data)
      else await contentService.adminUpdateBanner(editing._id, data)
      toast.success(isNew ? 'Đã thêm banner' : 'Đã cập nhật banner')
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu banner')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await contentService.adminDeleteBanner(deleteTarget._id)
      toast.success('Đã xóa banner')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa banner')
    }
  }

  const schedule = (b) => {
    if (!b.startsAt && !b.endsAt) return 'Luôn hiển thị'
    return `${b.startsAt ? formatDate(b.startsAt) : '…'} → ${b.endsAt ? formatDate(b.endsAt) : '…'}`
  }

  const columns = [
    { header: 'Ảnh', accessor: 'imageUrl', render: (v) => <img className={f.thumb} src={getImageUrl(v)} alt="" /> },
    { header: 'Banner', accessor: 'title', render: (v, b) => (<div><p className={f.cellTitle}>{v}</p>{b.subtitle && <p className={f.cellSub}>{b.subtitle}</p>}</div>) },
    { header: 'Liên kết', accessor: 'linkUrl', render: (v) => <span className={f.cellSub}>{v || '—'}</span> },
    { header: 'Thứ tự', accessor: 'order' },
    { header: 'Thời gian', accessor: 'startsAt', render: (_, b) => <span className={f.cellSub}>{schedule(b)}</span> },
    { header: 'Trạng thái', accessor: 'isActive', render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} /> },
  ]

  return (
    <div>
      <PageHeader title="Banner trang chủ" subtitle="Ảnh quảng bá hiển thị ở đầu trang chủ. Chỉ banner đang bật và trong khung thời gian mới hiện với khách." />
      <DataTable
        columns={columns}
        data={banners}
        loading={loading}
        pageSize={8}
        searchPlaceholder="Tìm banner..."
        emptyText="Chưa có banner nào"
        emptyIcon={<ImageIcon size={40} />}
        headerRight={<Button icon={<Plus size={15} />} onClick={() => openForm()}>Thêm banner</Button>}
        actions={(row) => (
          <>
            <Button size="xs" variant="outline" icon={<Pencil size={13} />} onClick={() => openForm(row)}>Sửa</Button>
            <Button size="xs" variant="danger" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget(row)}>Xóa</Button>
          </>
        )}
      />

      <Modal isOpen={!!editing} onClose={closeForm} title={isNew ? 'Thêm banner' : 'Sửa banner'} size="lg" footer={
        <>
          <Button variant="outline" onClick={closeForm} disabled={saving}>Hủy</Button>
          <Button onClick={save} loading={saving} disabled={!canSave}>{isNew ? 'Thêm banner' : 'Lưu thay đổi'}</Button>
        </>
      }>
        <div className={f.form}>
          <div className={f.field}>
            <span className={f.label}>Ảnh banner {isNew && <em>*</em>}</span>
            {preview && <img className={f.preview} src={preview} alt="Xem trước" />}
            <input className={f.control} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile} />
            <span className={f.hint}>JPG/PNG/WEBP, tối đa {MAX_MB}MB. Nên dùng ảnh ngang tỉ lệ 3:1 (ví dụ 1800×600) để không bị cắt.</span>
          </div>
          <label className={f.field}>
            <span className={f.label}>Tiêu đề <em>*</em></span>
            <input className={f.control} value={form.title} onChange={set('title')} maxLength={100} placeholder="Ví dụ: Giảm 20% giờ vàng cuối tuần" />
          </label>
          <label className={f.field}>
            <span className={f.label}>Mô tả ngắn</span>
            <input className={f.control} value={form.subtitle} onChange={set('subtitle')} maxLength={200} />
          </label>
          <label className={f.field}>
            <span className={f.label}>Liên kết khi bấm vào</span>
            <input className={f.control} value={form.linkUrl} onChange={set('linkUrl')} placeholder="/venues?sport=football hoặc https://..." />
            {!linkOk ? <span className={f.error}>Liên kết phải bắt đầu bằng "/" (trang trong web) hoặc http(s)://</span> : <span className={f.hint}>Để trống nếu banner chỉ để xem.</span>}
          </label>
          <div className={f.row}>
            <label className={f.field}>
              <span className={f.label}>Bắt đầu hiển thị</span>
              <input className={f.control} type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Ngừng hiển thị</span>
              <input className={f.control} type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
              {!datesOk && <span className={f.error}>Phải sau thời điểm bắt đầu</span>}
            </label>
          </div>
          <div className={f.row}>
            <label className={f.field}>
              <span className={f.label}>Thứ tự (nhỏ hiện trước)</span>
              <input className={f.control} type="number" value={form.order} onChange={set('order')} />
            </label>
            <label className={f.check} style={{ alignSelf: 'end', paddingBottom: 10 }}>
              <input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Đang bật
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Xóa banner"
        message={`Xóa banner "${deleteTarget?.title}"? Ảnh cũng sẽ bị xóa và không khôi phục được.`}
        confirmLabel="Xóa banner"
      />
    </div>
  )
}
