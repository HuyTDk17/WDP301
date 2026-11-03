import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Eye, ScrollText, RotateCcw, ArrowUp, ArrowDown, X } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import { contentService } from '@/services/contentService'
import { BUILTIN_POLICIES } from '@/pages/legal/builtinPolicies'
import { useToast } from '@/contexts/ToastContext'
import { formatDate } from '@/utils'
import f from '@/components/dashboard/form.module.css'

const EMPTY_SECTION = { title: '', body: '' }
const EMPTY = { key: '', title: '', intro: '', sections: [{ ...EMPTY_SECTION }], isPublished: true }
// Đường dẫn công khai: hai trang sẵn có giữ đường dẫn cũ, còn lại dùng /policies/:key
const publicPath = (key) => ({ privacy: '/privacy-policy', terms: '/terms-of-service' }[key] || `/policies/${key}`)

export default function PolicyManagement() {
  const { toast } = useToast()
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // null | { _id? , builtinKey? }
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    contentService.adminGetPolicies()
      .then((res) => setPolicies(res.policies || []))
      .catch(() => toast.error('Không thể tải danh sách chính sách'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  // Hai trang mặc định hiện luôn trong danh sách (dạng "Mặc định") cho tới khi Admin tùy chỉnh.
  const rows = useMemo(() => {
    const have = new Set(policies.map((p) => p.key))
    const builtin = Object.entries(BUILTIN_POLICIES).filter(([key]) => !have.has(key))
      .map(([key, c]) => ({ _id: `builtin-${key}`, key, title: c.title, builtin: true, isPublished: true }))
    return [...builtin, ...policies]
  }, [policies])

  const openForm = (row) => {
    if (!row) { setEditing({}); setForm(EMPTY); return }
    if (row.builtin) {
      const c = BUILTIN_POLICIES[row.key]
      setEditing({ builtinKey: row.key })
      setForm({ key: row.key, title: c.title, intro: c.intro, sections: c.sections.map((s) => ({ ...s })), isPublished: true })
      return
    }
    setEditing(row)
    setForm({ key: row.key, title: row.title, intro: row.intro || '', sections: (row.sections || []).map((s) => ({ ...s })), isPublished: row.isPublished !== false })
  }
  const closeForm = () => { if (!saving) setEditing(null) }
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const setSection = (i, key, value) => setForm((s) => ({ ...s, sections: s.sections.map((x, idx) => (idx === i ? { ...x, [key]: value } : x)) }))
  const addSection = () => setForm((s) => ({ ...s, sections: [...s.sections, { ...EMPTY_SECTION }] }))
  const removeSection = (i) => setForm((s) => ({ ...s, sections: s.sections.filter((_, idx) => idx !== i) }))
  const moveSection = (i, delta) => setForm((s) => {
    const arr = [...s.sections]; const j = i + delta
    if (j < 0 || j >= arr.length) return s;
    [arr[i], arr[j]] = [arr[j], arr[i]]
    return { ...s, sections: arr }
  })

  const isCreate = !editing?._id
  const keyOk = /^[a-z0-9][a-z0-9-]{1,39}$/.test(form.key)
  const sectionsOk = form.sections.length > 0 && form.sections.every((s) => s.title.trim() && s.body.trim())
  const canSave = form.title.trim().length >= 3 && sectionsOk && (!isCreate || keyOk) && !saving

  const save = async () => {
    const payload = { title: form.title.trim(), intro: form.intro.trim(), isPublished: form.isPublished, sections: form.sections.map((s) => ({ title: s.title.trim(), body: s.body.trim() })) }
    setSaving(true)
    try {
      if (isCreate) await contentService.adminCreatePolicy({ ...payload, key: form.key })
      else await contentService.adminUpdatePolicy(editing._id, payload)
      toast.success('Đã lưu trang chính sách')
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu trang chính sách')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await contentService.adminDeletePolicy(deleteTarget._id)
      toast.success(BUILTIN_POLICIES[deleteTarget.key] ? 'Đã khôi phục nội dung mặc định' : 'Đã xóa trang chính sách')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa')
    }
  }

  const columns = [
    { header: 'Trang', accessor: 'title', render: (v, p) => (<div><p className={f.cellTitle}>{v}</p><p className={f.cellSub}>{publicPath(p.key)}</p></div>) },
    { header: 'Nguồn nội dung', accessor: 'builtin', render: (_, p) => <span className={f.badge}>{p.builtin ? 'Mặc định' : 'Đã tùy chỉnh'}</span> },
    { header: 'Hiển thị', accessor: 'isPublished', render: (v) => <span className={f.badge}>{v ? 'Công khai' : 'Đã ẩn'}</span> },
    { header: 'Cập nhật', accessor: 'updatedAt', render: (v) => <span className={f.cellSub}>{v ? formatDate(v) : '—'}</span> },
  ]

  return (
    <div>
      <PageHeader title="Trang chính sách" subtitle="Soạn điều khoản, chính sách bảo mật, chính sách hủy sân... Trang 'privacy' và 'terms' có nội dung mặc định, bạn có thể tùy chỉnh hoặc khôi phục." />
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        pageSize={8}
        searchPlaceholder="Tìm trang chính sách..."
        filters={[
          { key: 'isPublished', placeholder: 'Mọi hiển thị', options: [{ value: 'true', label: 'Công khai' }, { value: 'false', label: 'Đã ẩn' }] },
          { key: 'builtin', placeholder: 'Mọi nguồn nội dung', options: [{ value: 'true', label: 'Mặc định' }, { value: 'false', label: 'Đã tùy chỉnh' }], match: (r, v) => !!r.builtin === (v === 'true') },
        ]}
        emptyText="Chưa có trang chính sách"
        emptyIcon={<ScrollText size={40} />}
        headerRight={<Button icon={<Plus size={15} />} onClick={() => openForm()}>Thêm trang</Button>}
        actions={(row) => (
          <>
            {row.isPublished && <Link to={publicPath(row.key)} target="_blank"><Button size="xs" variant="ghost" icon={<Eye size={13} />}>Xem</Button></Link>}
            <Button size="xs" variant="outline" icon={<Pencil size={13} />} onClick={() => openForm(row)}>{row.builtin ? 'Tùy chỉnh' : 'Sửa'}</Button>
            {!row.builtin && (
              <Button size="xs" variant="danger" icon={BUILTIN_POLICIES[row.key] ? <RotateCcw size={13} /> : <Trash2 size={13} />} onClick={() => setDeleteTarget(row)}>
                {BUILTIN_POLICIES[row.key] ? 'Về mặc định' : 'Xóa'}
              </Button>
            )}
          </>
        )}
      />

      <Modal isOpen={!!editing} onClose={closeForm} title={isCreate && !editing?.builtinKey ? 'Thêm trang chính sách' : 'Sửa trang chính sách'} size="lg" footer={
        <>
          <Button variant="outline" onClick={closeForm} disabled={saving}>Hủy</Button>
          <Button onClick={save} loading={saving} disabled={!canSave}>Lưu</Button>
        </>
      }>
        <div className={f.form}>
          <div className={f.row}>
            <label className={f.field}>
              <span className={f.label}>Mã trang {isCreate && <em>*</em>}</span>
              <input className={f.control} value={form.key} onChange={set('key')} disabled={!isCreate || !!editing?.builtinKey} placeholder="cancellation" maxLength={40} />
              {isCreate && !editing?.builtinKey && (form.key && !keyOk ? <span className={f.error}>Chỉ chữ thường, số, dấu gạch ngang (2–40 ký tự)</span> : <span className={f.hint}>Đường dẫn: /policies/{form.key || '...'} — không đổi được sau khi tạo.</span>)}
            </label>
            <label className={f.field}>
              <span className={f.label}>Tiêu đề <em>*</em></span>
              <input className={f.control} value={form.title} onChange={set('title')} maxLength={150} />
            </label>
          </div>
          <label className={f.field}>
            <span className={f.label}>Đoạn mở đầu</span>
            <textarea className={f.control} rows={3} value={form.intro} onChange={set('intro')} maxLength={1000} />
          </label>

          <div className={f.field}>
            <span className={f.label}>Các mục nội dung <em>*</em></span>
            {form.sections.map((s, i) => (
              <div key={i} className={f.sectionBox}>
                <div className={f.sectionHead}>
                  <span>Mục {i + 1}</span>
                  <span>
                    <button type="button" className={f.iconBtn} onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label="Lên"><ArrowUp size={14} /></button>
                    <button type="button" className={f.iconBtn} onClick={() => moveSection(i, 1)} disabled={i === form.sections.length - 1} aria-label="Xuống"><ArrowDown size={14} /></button>
                    <button type="button" className={f.iconBtn} onClick={() => removeSection(i)} disabled={form.sections.length === 1} aria-label="Xóa mục"><X size={14} /></button>
                  </span>
                </div>
                <input className={f.control} placeholder="Tiêu đề mục, ví dụ: 1. Hủy sân và hoàn tiền" value={s.title} onChange={(e) => setSection(i, 'title', e.target.value)} maxLength={150} />
                <textarea className={f.control} rows={4} placeholder="Nội dung mục" value={s.body} onChange={(e) => setSection(i, 'body', e.target.value)} maxLength={5000} />
              </div>
            ))}
            {form.sections.length < 30 && <Button type="button" size="sm" variant="outline" icon={<Plus size={14} />} onClick={addSection}>Thêm mục</Button>}
            {!sectionsOk && <span className={f.error}>Mỗi mục cần có cả tiêu đề và nội dung</span>}
          </div>

          <label className={f.check}><input type="checkbox" checked={form.isPublished} onChange={set('isPublished')} /> Công khai trang này</label>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title={BUILTIN_POLICIES[deleteTarget?.key] ? 'Khôi phục nội dung mặc định' : 'Xóa trang chính sách'}
        message={BUILTIN_POLICIES[deleteTarget?.key]
          ? 'Bản tùy chỉnh sẽ bị xóa và trang quay về nội dung mặc định của hệ thống.'
          : `Xóa trang "${deleteTarget?.title}"? Đường dẫn công khai sẽ không còn truy cập được.`}
        confirmLabel={BUILTIN_POLICIES[deleteTarget?.key] ? 'Khôi phục' : 'Xóa trang'}
      />
    </div>
  )
}
