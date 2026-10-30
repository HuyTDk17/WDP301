import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Eye, Newspaper } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { contentService } from '@/services/contentService'
import { useToast } from '@/contexts/ToastContext'
import { formatDate, getImageUrl } from '@/utils'
import f from '@/components/dashboard/form.module.css'

const PAGE_SIZE = 10
const MAX_MB = 5
const EMPTY = { title: '', summary: '', content: '', status: 'draft' }
const TABS = [['', 'Tất cả'], ['published', 'Đã đăng'], ['draft', 'Bản nháp']]

export default function NewsManagement() {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [editing, setEditing] = useState(null)     // null | {} (mới) | {_id}
  const [loadingForm, setLoadingForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [cover, setCover] = useState('')            // ảnh bìa hiện có
  const [file, setFile] = useState(null)
  const [removeCover, setRemoveCover] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [filePreview, setFilePreview] = useState('')

  // Ảnh xem trước của file vừa chọn: tạo một lần và thu hồi khi đổi file / đóng form (tránh rò rỉ bộ nhớ)
  useEffect(() => {
    if (!file) { setFilePreview(''); return undefined }
    const url = URL.createObjectURL(file)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const load = useCallback((p, t, s) => {
    setLoading(true)
    contentService.adminGetNews({ page: p, limit: PAGE_SIZE, status: t || undefined, search: s || undefined })
      .then((res) => { setRows(res.news || []); setTotalPages(res.totalPages || 1); setTotal(res.total || 0) })
      .catch(() => toast.error('Không thể tải danh sách bài viết'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load(1, '', '') }, [load])

  const changeTab = (t) => { setTab(t); setPage(1); load(1, t, search) }
  const changePage = (p) => { setPage(p); load(p, tab, search) }
  const changeSearch = (s) => { setSearch(s); setPage(1); load(1, tab, s) }
  const reload = () => load(page, tab, search)

  const openForm = async (row) => {
    setFile(null); setRemoveCover(false)
    if (!row) { setEditing({}); setForm(EMPTY); setCover(''); return }
    setEditing(row); setLoadingForm(true)
    try {
      const { article } = await contentService.adminGetNewsById(row._id)
      setForm({ title: article.title, summary: article.summary || '', content: article.content, status: article.status })
      setCover(article.coverImage || '')
    } catch {
      toast.error('Không thể tải bài viết'); setEditing(null)
    } finally {
      setLoadingForm(false)
    }
  }
  const closeForm = () => { if (!saving) setEditing(null) }
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))

  const pickFile = (e) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    if (picked.size > MAX_MB * 1024 * 1024) { toast.error(`Ảnh lớn hơn ${MAX_MB}MB`); return }
    setFile(picked); setRemoveCover(false)
  }

  const isNew = !editing?._id
  const titleOk = form.title.trim().length >= 5
  const contentOk = form.content.trim().length >= 20
  const canSave = titleOk && contentOk && !saving && !loadingForm

  const save = async () => {
    const data = new FormData()
    data.append('title', form.title.trim())
    data.append('summary', form.summary.trim())
    data.append('content', form.content.trim())
    data.append('status', form.status)
    if (file) data.append('coverImage', file)
    if (removeCover) data.append('removeCover', 'true')
    setSaving(true)
    try {
      if (isNew) await contentService.adminCreateNews(data)
      else await contentService.adminUpdateNews(editing._id, data)
      toast.success(form.status === 'published' ? 'Đã lưu và đăng bài' : 'Đã lưu bản nháp')
      setEditing(null)
      reload()
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu bài viết')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await contentService.adminDeleteNews(deleteTarget._id)
      toast.success('Đã xóa bài viết')
      setDeleteTarget(null)
      reload()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa bài viết')
    }
  }

  const columns = [
    { header: 'Bài viết', accessor: 'title', render: (v, n) => (<div><p className={f.cellTitle}>{v}</p><p className={f.cellSub}>/news/{n.slug}</p></div>) },
    { header: 'Trạng thái', accessor: 'status', render: (v) => <span className={f.badge}>{v === 'published' ? 'Đã đăng' : 'Bản nháp'}</span> },
    { header: 'Ngày đăng', accessor: 'publishedAt', render: (v) => <span className={f.cellSub}>{v ? formatDate(v) : '—'}</span> },
    { header: 'Tạo lúc', accessor: 'createdAt', render: (v) => <span className={f.cellSub}>{formatDate(v)}</span> },
  ]
  const shownCover = filePreview || (removeCover ? '' : (cover ? getImageUrl(cover) : ''))

  return (
    <div>
      <PageHeader title="Tin tức" subtitle="Soạn và đăng bài lên trang Tin tức. Bản nháp chỉ Admin thấy." />
      <div className={f.tabs}>
        {TABS.map(([val, label]) => <button key={val} type="button" className={`${f.tab} ${tab === val ? f.tabActive : ''}`} onClick={() => changeTab(val)}>{label}</button>)}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        pageSize={PAGE_SIZE}
        searchPlaceholder="Tìm theo tiêu đề..."
        emptyText="Chưa có bài viết nào"
        emptyIcon={<Newspaper size={40} />}
        headerRight={<Button icon={<Plus size={15} />} onClick={() => openForm()}>Viết bài mới</Button>}
        server={{ page, totalPages, total, onPageChange: changePage, onSearchChange: changeSearch }}
        actions={(row) => (
          <>
            {row.status === 'published' && <Link to={`/news/${row.slug}`} target="_blank"><Button size="xs" variant="ghost" icon={<Eye size={13} />}>Xem</Button></Link>}
            <Button size="xs" variant="outline" icon={<Pencil size={13} />} onClick={() => openForm(row)}>Sửa</Button>
            <Button size="xs" variant="danger" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget(row)}>Xóa</Button>
          </>
        )}
      />

      <Modal isOpen={!!editing} onClose={closeForm} title={isNew ? 'Viết bài mới' : 'Sửa bài viết'} size="lg" footer={
        <>
          <Button variant="outline" onClick={closeForm} disabled={saving}>Hủy</Button>
          <Button onClick={save} loading={saving} disabled={!canSave}>{form.status === 'published' ? 'Lưu và đăng' : 'Lưu nháp'}</Button>
        </>
      }>
        {loadingForm ? <div style={{ textAlign: 'center', padding: 32 }}><Spinner /></div> : (
          <div className={f.form}>
            <label className={f.field}>
              <span className={f.label}>Tiêu đề <em>*</em></span>
              <input className={f.control} value={form.title} onChange={set('title')} maxLength={150} />
              {form.title && !titleOk && <span className={f.error}>Tiêu đề cần ít nhất 5 ký tự</span>}
            </label>
            <label className={f.field}>
              <span className={f.label}>Tóm tắt (hiện ở danh sách)</span>
              <textarea className={f.control} rows={2} value={form.summary} onChange={set('summary')} maxLength={300} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Nội dung <em>*</em></span>
              <textarea className={f.control} rows={12} value={form.content} onChange={set('content')} maxLength={20000} placeholder={'Viết bằng văn bản thường. Cách một dòng trống để sang đoạn mới.'} />
              <span className={contentOk || !form.content ? f.hint : f.error}>{form.content.trim().length}/20000 · tối thiểu 20 ký tự · không dùng HTML</span>
            </label>
            <div className={f.field}>
              <span className={f.label}>Ảnh bìa</span>
              {shownCover && <img className={f.preview} src={shownCover} alt="Ảnh bìa" />}
              <input className={f.control} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile} />
              {cover && !file && (
                <label className={f.check}><input type="checkbox" checked={removeCover} onChange={(e) => setRemoveCover(e.target.checked)} /> Gỡ ảnh bìa hiện tại</label>
              )}
            </div>
            <label className={f.field}>
              <span className={f.label}>Trạng thái</span>
              <select className={f.control} value={form.status} onChange={set('status')}>
                <option value="draft">Bản nháp (chưa công khai)</option>
                <option value="published">Đăng công khai</option>
              </select>
            </label>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Xóa bài viết"
        message={`Xóa bài "${deleteTarget?.title}"? Đường dẫn bài viết sẽ không còn truy cập được.`}
        confirmLabel="Xóa bài viết"
      />
    </div>
  )
}
