import { useState, useEffect, useCallback } from 'react'
import { MessageSquareReply, Pencil, Trash2, Star } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import Rating from '@/components/ui/Rating/Rating'
import Avatar from '@/components/ui/Avatar/Avatar'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import { formatDate, getAvatarPlaceholder } from '@/utils'
import styles from './Reviews.module.css'

const PAGE_SIZE = 8
const MAX_REPLY = 1000

export default function OwnerReviews() {
  const { toast } = useToast()
  const [data, setData] = useState({ reviews: [], total: 0, unreplied: 0, totalPages: 1, venues: [] })
  const [loading, setLoading] = useState(true)
  const [replied, setReplied] = useState('') // '' | 'false' | 'true'
  const [venueId, setVenueId] = useState('')
  const [page, setPage] = useState(1)

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    venueService.getOwnerReviews({ page, limit: PAGE_SIZE, replied: replied || undefined, venueId: venueId || undefined })
      .then((res) => setData(res))
      .catch(() => toast.error('Không thể tải danh sách đánh giá'))
      .finally(() => setLoading(false))
  }, [page, replied, venueId])

  useEffect(() => { load() }, [load])

  const changeFilter = (setter) => (value) => { setter(value); setPage(1); setEditingId(null) }

  const startReply = (review) => { setEditingId(review._id); setDraft(review.reply?.text || '') }
  const cancelReply = () => { setEditingId(null); setDraft('') }

  const saveReply = async (review) => {
    if (draft.trim().length < 2) return
    setSaving(true)
    try {
      await venueService.replyToReview(review._id, draft.trim())
      toast.success(review.reply?.text ? 'Đã cập nhật phản hồi' : 'Đã gửi phản hồi, khách sẽ nhận thông báo')
      cancelReply()
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi phản hồi')
    } finally {
      setSaving(false)
    }
  }

  const removeReply = async () => {
    setSaving(true)
    try {
      await venueService.deleteReviewReply(deleteTarget._id)
      toast.success('Đã xóa phản hồi')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa phản hồi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Đánh giá của khách"
        subtitle={data.unreplied > 0 ? `${data.unreplied} đánh giá chưa được trả lời` : 'Bạn đã trả lời tất cả đánh giá'}
      />

      <div className={styles.filters}>
        <div className={styles.tabs}>
          {[['', 'Tất cả'], ['false', `Chưa trả lời${data.unreplied ? ` (${data.unreplied})` : ''}`], ['true', 'Đã trả lời']].map(([val, label]) => (
            <button key={val} type="button" className={`${styles.tab} ${replied === val ? styles.tabActive : ''}`} onClick={() => changeFilter(setReplied)(val)}>{label}</button>
          ))}
        </div>
        {data.venues.length > 1 && (
          <select className={styles.select} value={venueId} onChange={(e) => changeFilter(setVenueId)(e.target.value)}>
            <option value="">Tất cả địa điểm</option>
            {data.venues.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className={styles.center}><Spinner /></div>
      ) : data.reviews.length === 0 ? (
        <EmptyState icon={<Star size={44} />} title="Chưa có đánh giá nào" description="Khi khách hàng đánh giá địa điểm của bạn, chúng sẽ hiện ở đây để bạn trả lời." />
      ) : (
        <div className={styles.list}>
          {data.reviews.map((r) => (
            <div key={r._id} className={styles.card}>
              <div className={styles.top}>
                <Avatar src={getAvatarPlaceholder(r.userId?.name || 'Khách')} name={r.userId?.name} size="md" />
                <div className={styles.who}>
                  <p className={styles.name}>{r.userId?.name || 'Khách hàng'}</p>
                  <p className={styles.meta}>{r.venueName} · {formatDate(r.createdAt)}{r.editedAt ? ' · đã chỉnh sửa' : ''}</p>
                </div>
                <Rating value={r.rating} size="sm" />
              </div>
              {r.comment ? <p className={styles.comment}>{r.comment}</p> : <p className={styles.noComment}>Khách chỉ chấm điểm, không để lại nội dung.</p>}

              {editingId === r._id ? (
                <div className={styles.replyBox}>
                  <textarea className={styles.textarea} rows={3} maxLength={MAX_REPLY} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Cảm ơn khách hoặc giải đáp thắc mắc. Phản hồi hiển thị công khai dưới đánh giá." />
                  <div className={styles.replyFoot}>
                    <span className={styles.counter}>{draft.length}/{MAX_REPLY}</span>
                    <div className={styles.btns}>
                      <Button size="sm" variant="outline" onClick={cancelReply} disabled={saving}>Hủy</Button>
                      <Button size="sm" onClick={() => saveReply(r)} loading={saving} disabled={draft.trim().length < 2}>{r.reply?.text ? 'Lưu phản hồi' : 'Gửi phản hồi'}</Button>
                    </div>
                  </div>
                </div>
              ) : r.reply?.text ? (
                <div className={styles.reply}>
                  <p className={styles.replyLabel}>Phản hồi của bạn · {formatDate(r.reply.repliedAt)}</p>
                  <p className={styles.replyText}>{r.reply.text}</p>
                  <div className={styles.btns}>
                    <button type="button" className={styles.link} onClick={() => startReply(r)}><Pencil size={13} /> Sửa</button>
                    <button type="button" className={`${styles.link} ${styles.linkDanger}`} onClick={() => setDeleteTarget(r)}><Trash2 size={13} /> Xóa</button>
                  </div>
                </div>
              ) : (
                <div><Button size="sm" variant="outline" icon={<MessageSquareReply size={14} />} onClick={() => startReply(r)}>Trả lời</Button></div>
              )}
            </div>
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className={styles.pager}>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trang trước</Button>
          <span>Trang {page}/{data.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Trang sau</Button>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeReply}
        loading={saving}
        title="Xóa phản hồi"
        message="Phản hồi này sẽ biến mất khỏi trang địa điểm. Bạn có thể trả lời lại bất cứ lúc nào."
        confirmLabel="Xóa phản hồi"
      />
    </div>
  )
}
