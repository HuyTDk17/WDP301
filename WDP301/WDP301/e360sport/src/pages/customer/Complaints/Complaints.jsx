import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquareWarning, Plus, ImagePlus, X, ShieldCheck } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Modal from '@/components/ui/Modal/Modal'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import { complaintService, COMPLAINT_CATEGORIES, complaintCategoryLabel } from '@/services/complaintService'
import { bookingService } from '@/services/bookingService'
import { useToast } from '@/contexts/ToastContext'
import { formatDate, getImageUrl } from '@/utils'
import styles from './Complaints.module.css'

const MAX_FILES = 5
const MAX_MB = 5
const EMPTY_FORM = { bookingId: '', category: 'service', subject: '', description: '' }

export default function Complaints() {
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState([])

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadComplaints = useCallback(() => {
    setLoading(true)
    complaintService.getMine()
      .then((res) => setComplaints(res.complaints || []))
      .catch(() => toast.error('Không thể tải danh sách khiếu nại'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadComplaints() }, [loadComplaints])

  // Chỉ lượt đặt đã phát sinh dịch vụ mới khiếu nại được (không gồm đơn chờ thanh toán).
  useEffect(() => {
    bookingService.getMyBookings()
      .then((res) => setBookings((res.bookings || []).filter((b) => b.status !== 'awaiting_payment')))
      .catch(() => {})
  }, [])

  // Từ nút "Khiếu nại" ở lịch sử đặt sân (?bookingId=...): mở sẵn form với đúng lượt đặt đó.
  useEffect(() => {
    const bookingId = searchParams.get('bookingId')
    if (!bookingId) return
    setForm({ ...EMPTY_FORM, bookingId })
    setFormOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const previews = useMemo(() => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })), [files])
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews])

  const openForm = () => { setForm(EMPTY_FORM); setFiles([]); setFormOpen(true) }
  const closeForm = () => { if (!submitting) { setFormOpen(false); setFiles([]) } }
  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    const tooBig = picked.find((f) => f.size > MAX_MB * 1024 * 1024)
    if (tooBig) { toast.error(`Ảnh "${tooBig.name}" lớn hơn ${MAX_MB}MB`); return }
    const next = [...files, ...picked]
    if (next.length > MAX_FILES) toast.info(`Chỉ đính kèm tối đa ${MAX_FILES} ảnh`)
    setFiles(next.slice(0, MAX_FILES))
  }

  const subjectOk = form.subject.trim().length >= 5
  const descOk = form.description.trim().length >= 20
  const canSubmit = !!form.bookingId && subjectOk && descOk && !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    const data = new FormData()
    data.append('bookingId', form.bookingId)
    data.append('category', form.category)
    data.append('subject', form.subject.trim())
    data.append('description', form.description.trim())
    files.forEach((f) => data.append('evidence', f))
    setSubmitting(true)
    try {
      await complaintService.create(data)
      toast.success('Đã gửi khiếu nại. Quản trị viên sẽ phản hồi cho bạn sớm.')
      setFormOpen(false)
      setFiles([])
      loadComplaints()
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi khiếu nại, vui lòng thử lại')
    } finally {
      setSubmitting(false)
    }
  }

  const openDetail = (c) => {
    setDetail(c)
    setDetailLoading(true)
    complaintService.getMineById(c._id)
      .then((res) => setDetail(res.complaint))
      .catch(() => toast.error('Không thể tải chi tiết khiếu nại'))
      .finally(() => setDetailLoading(false))
  }

  const bookingLabel = (b) => `${b.venueName || 'Địa điểm'} · ${formatDate(b.date)} ${b.startTime}–${b.endTime}`

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Khiếu nại của tôi</h1>
          <p className={styles.sub}>Gặp vấn đề với một lượt đặt sân? Gửi cho quản trị viên để được hỗ trợ.</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openForm}>Gửi khiếu nại</Button>
      </div>

      {loading ? (
        <div className={styles.center}><Spinner /></div>
      ) : complaints.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={48} />}
          title="Bạn chưa gửi khiếu nại nào"
          description="Nếu sân không đúng mô tả, bị thu sai tiền hoặc chưa được hoàn tiền, hãy gửi khiếu nại để chúng tôi hỗ trợ."
          action={openForm}
          actionLabel="Gửi khiếu nại"
        />
      ) : (
        <div className={styles.list}>
          {complaints.map((c) => (
            <button key={c._id} type="button" className={styles.card} onClick={() => openDetail(c)}>
              <div className={styles.cardTop}>
                <span className={styles.cardTitle}>{c.subject}</span>
                <StatusBadge status={c.status} />
              </div>
              <p className={styles.cardMeta}>{c.venueName} · {complaintCategoryLabel(c.category)} · {formatDate(c.createdAt)}</p>
              <p className={styles.cardDesc}>{c.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Form gửi khiếu nại ── */}
      <Modal isOpen={formOpen} onClose={closeForm} title="Gửi khiếu nại" size="lg" footer={
        <>
          <Button variant="outline" onClick={closeForm} disabled={submitting}>Hủy</Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>Gửi khiếu nại</Button>
        </>
      }>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Lượt đặt liên quan <em>*</em></span>
            <select className={styles.control} value={form.bookingId} onChange={setField('bookingId')}>
              <option value="">— Chọn lượt đặt —</option>
              {bookings.map((b) => <option key={b._id} value={b._id}>{bookingLabel(b)}</option>)}
            </select>
            {bookings.length === 0 && <span className={styles.hint}>Bạn cần có ít nhất một lượt đặt sân để gửi khiếu nại.</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Loại vấn đề</span>
            <select className={styles.control} value={form.category} onChange={setField('category')}>
              {COMPLAINT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Tiêu đề <em>*</em></span>
            <input className={styles.control} value={form.subject} onChange={setField('subject')} maxLength={120} placeholder="Ví dụ: Sân không đúng mô tả, chưa nhận được tiền hoàn" />
            {form.subject && !subjectOk && <span className={styles.error}>Tiêu đề cần ít nhất 5 ký tự</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Mô tả chi tiết <em>*</em></span>
            <textarea className={styles.control} rows={5} value={form.description} onChange={setField('description')} maxLength={3000} placeholder="Chuyện gì đã xảy ra? Khi nào? Bạn mong muốn được giải quyết thế nào?" />
            <span className={descOk || !form.description ? styles.hint : styles.error}>{form.description.trim().length}/3000 · tối thiểu 20 ký tự</span>
          </label>

          <div className={styles.field}>
            <span className={styles.label}>Ảnh bằng chứng <span className={styles.optional}>(tối đa {MAX_FILES} ảnh, mỗi ảnh ≤ {MAX_MB}MB)</span></span>
            <div className={styles.thumbs}>
              {previews.map((p, i) => (
                <div key={p.url} className={styles.thumb}>
                  <img src={p.url} alt={p.name} />
                  <button type="button" className={styles.thumbRemove} onClick={() => setFiles((fs) => fs.filter((_, idx) => idx !== i))} aria-label="Bỏ ảnh"><X size={12} /></button>
                </div>
              ))}
              {files.length < MAX_FILES && (
                <label className={styles.addThumb}>
                  <ImagePlus size={20} />
                  <span>Thêm ảnh</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={handleFiles} />
                </label>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Chi tiết khiếu nại ── */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title="Chi tiết khiếu nại" size="lg">
        {detail && (
          <div className={styles.detail}>
            <div className={styles.detailHead}>
              <h3 className={styles.detailTitle}>{detail.subject}</h3>
              <StatusBadge status={detail.status} />
            </div>
            <p className={styles.cardMeta}>{detail.venueName} · {complaintCategoryLabel(detail.category)} · Gửi ngày {formatDate(detail.createdAt)}</p>
            <p className={styles.detailText}>{detail.description}</p>

            {detail.evidence?.length > 0 && (
              <div className={styles.thumbs}>
                {detail.evidence.map((url) => (
                  <a key={url} href={getImageUrl(url)} target="_blank" rel="noreferrer" className={styles.thumb}><img src={getImageUrl(url)} alt="Bằng chứng" /></a>
                ))}
              </div>
            )}

            {detailLoading && <div className={styles.center}><Spinner size="sm" /></div>}

            {detail.messages?.length > 0 && (
              <div className={styles.thread}>
                <p className={styles.threadTitle}>Phản hồi từ quản trị viên</p>
                {detail.messages.map((m, i) => (
                  <div key={i} className={styles.msg}>
                    <p>{m.text}</p>
                    <span>{formatDate(m.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}

            {detail.resolution && (
              <div className={`${styles.resolution} ${detail.status === 'rejected' ? styles.resolutionRejected : ''}`}>
                <p className={styles.threadTitle}>{detail.status === 'resolved' ? 'Kết quả giải quyết' : 'Kết quả xem xét'}</p>
                <p className={styles.detailText}>{detail.resolution}</p>
              </div>
            )}
            {['open', 'investigating'].includes(detail.status) && (
              <p className={styles.waiting}><MessageSquareWarning size={14} /> Khiếu nại đang chờ quản trị viên xử lý. Bạn sẽ nhận thông báo khi có phản hồi.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
