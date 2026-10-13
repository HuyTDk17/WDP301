import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Power, Tags } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import { contentService } from '@/services/contentService'
import { useToast } from '@/contexts/ToastContext'
import f from '@/components/dashboard/form.module.css'

const EMPTY = { key: '', name: '', icon: '🏅', color: '#0A84FF', order: '' }

export default function SportCategoryManagement() {
  const { toast } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // null | {} (mới) | {_id,...}
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    contentService.adminGetSports()
      .then((res) => setItems(res.categories || []))
      .catch(() => toast.error('Không thể tải danh mục môn thể thao'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const openForm = (c = {}) => {
    setEditing(c)
    setForm(c._id ? { key: c.key, name: c.name, icon: c.icon, color: c.color, order: c.order } : EMPTY)
  }
  const closeForm = () => { if (!saving) setEditing(null) }
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))

  const isNew = !editing?._id
  const keyOk = /^[a-z][a-z0-9-]{1,29}$/.test(form.key)
  const canSave = form.name.trim().length >= 2 && form.icon.trim() && (!isNew || keyOk) && !saving

  const save = async () => {
    const payload = { name: form.name.trim(), icon: form.icon.trim(), color: form.color, ...(form.order !== '' ? { order: Number(form.order) } : {}) }
    setSaving(true)
    try {
      if (isNew) await contentService.adminCreateSport({ ...payload, key: form.key })
      else await contentService.adminUpdateSport(editing._id, payload)
      toast.success(isNew ? 'Đã thêm môn thể thao' : 'Đã cập nhật')
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu danh mục')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (c) => {
    try {
      await contentService.adminUpdateSport(c._id, { isActive: !c.isActive })
      toast.success(c.isActive ? 'Đã tắt môn — không nhận sân mới' : 'Đã bật môn')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể đổi trạng thái')
    }
  }

  const remove = async () => {
    try {
      await contentService.adminDeleteSport(deleteTarget._id)
      toast.success('Đã xóa danh mục')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa danh mục')
      setDeleteTarget(null)
    }
  }

  const columns = [
    { header: 'Môn', accessor: 'name', render: (v, c) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={f.sportChip} style={{ background: `${c.color}22` }}>{c.icon}</span>
        <div><p className={f.cellTitle}>{v}</p><p className={f.cellSub}>{c.key}</p></div>
      </div>
    ) },
    { header: 'Đang dùng', accessor: 'usage', render: (u) => <span className={f.cellSub}>{u?.venues ?? 0} địa điểm · {u?.courts ?? 0} sân</span> },
    { header: 'Thứ tự', accessor: 'order' },
    { header: 'Trạng thái', accessor: 'isActive', render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} /> },
  ]

  return (
    <div>
      <PageHeader title="Danh mục môn thể thao" subtitle="Quản lý các môn hiển thị ở trang chủ, bộ lọc và khi chủ sân tạo sân. Tắt một môn thì không nhận sân mới nhưng dữ liệu cũ vẫn giữ nguyên." />
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        pageSize={12}
        searchPlaceholder="Tìm môn..."
        emptyText="Chưa có môn nào"
        emptyIcon={<Tags size={40} />}
        headerRight={<Button icon={<Plus size={15} />} onClick={() => openForm()}>Thêm môn</Button>}
        actions={(row) => (
          <>
            <Button size="xs" variant="outline" icon={<Pencil size={13} />} onClick={() => openForm(row)}>Sửa</Button>
            <Button size="xs" variant="outline" icon={<Power size={13} />} onClick={() => toggle(row)}>{row.isActive ? 'Tắt' : 'Bật'}</Button>
            <Button size="xs" variant="danger" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget(row)}>Xóa</Button>
          </>
        )}
      />

      <Modal isOpen={!!editing} onClose={closeForm} title={isNew ? 'Thêm môn thể thao' : 'Sửa môn thể thao'} footer={
        <>
          <Button variant="outline" onClick={closeForm} disabled={saving}>Hủy</Button>
          <Button onClick={save} loading={saving} disabled={!canSave}>{isNew ? 'Thêm môn' : 'Lưu thay đổi'}</Button>
        </>
      }>
        <div className={f.form}>
          <label className={f.field}>
            <span className={f.label}>Mã môn {isNew && <em>*</em>}</span>
            <input className={f.control} value={form.key} onChange={set('key')} disabled={!isNew} placeholder="pickleball" maxLength={30} />
            {isNew ? (form.key && !keyOk ? <span className={f.error}>Chỉ chữ thường, số, dấu gạch ngang; bắt đầu bằng chữ (2–30 ký tự)</span> : <span className={f.hint}>Dùng trong dữ liệu và đường dẫn lọc; không đổi được sau khi tạo.</span>) : <span className={f.hint}>Mã không đổi được vì sân đang tham chiếu tới mã này.</span>}
          </label>
          <label className={f.field}>
            <span className={f.label}>Tên hiển thị <em>*</em></span>
            <input className={f.control} value={form.name} onChange={set('name')} maxLength={40} placeholder="Pickleball" />
          </label>
          <div className={f.row}>
            <label className={f.field}>
              <span className={f.label}>Biểu tượng (emoji) <em>*</em></span>
              <input className={f.control} value={form.icon} onChange={set('icon')} maxLength={8} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Màu nhấn</span>
              <input className={f.control} type="color" value={form.color} onChange={set('color')} />
            </label>
          </div>
          <label className={f.field}>
            <span className={f.label}>Thứ tự hiển thị</span>
            <input className={f.control} type="number" value={form.order} onChange={set('order')} placeholder="Để trống = xếp cuối" />
          </label>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Xóa danh mục môn"
        message={deleteTarget && (deleteTarget.usage?.venues || deleteTarget.usage?.courts)
          ? `Môn "${deleteTarget.name}" đang được dùng bởi ${deleteTarget.usage.venues} địa điểm và ${deleteTarget.usage.courts} sân nên sẽ không xóa được. Hãy dùng nút Tắt thay thế.`
          : `Xóa môn "${deleteTarget?.name}"? Thao tác này không hoàn tác được.`}
        confirmLabel="Xóa môn"
      />
    </div>
  )
}
