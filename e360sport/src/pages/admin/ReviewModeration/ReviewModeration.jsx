import { useState, useEffect, useCallback } from 'react'
import { Star, Trash2, MessageSquareWarning } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import Button from '@/components/ui/Button/Button'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import styles from './ReviewModeration.module.css'

const PAGE_SIZE = 10

export default function ReviewModeration() {
  const { toast } = useToast()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const loadReviews = useCallback((p = page, s = search) => {
    setLoading(true)
    venueService.getAllReviewsAdmin({ page: p, limit: PAGE_SIZE, search: s })
      .then((res) => {
        setReviews(res.reviews || [])
        setTotalPages(res.totalPages || 1)
        setTotal(res.total || 0)
      })
      .catch(() => toast.error('Không thể tải danh sách đánh giá'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadReviews(1, '') }, [])

  const handlePageChange = (p) => { setPage(p); loadReviews(p, search) }
  const handleSearchChange = (s) => { setSearch(s); setPage(1); loadReviews(1, s) }

  const handleDelete = async (reason) => {
    try {
      await venueService.adminDeleteReview(deleteTarget._id, reason)
      toast.success('Đã xóa đánh giá và thông báo cho người viết')
      setDeleteTarget(null)
      loadReviews(page, search)
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa đánh giá')
    }
  }

  const columns = [
    {
      header: 'Địa điểm', accessor: 'venueName', render: (v) => <span className={styles.venueName}>{v}</span>,
    },
    {
      header: 'Người đánh giá', accessor: 'reviewerName', render: (v, row) => (
        <div>
          <p className={styles.reviewerName}>{v}</p>
          <p className={styles.reviewerEmail}>{row.reviewerEmail}</p>
        </div>
      ),
    },
    {
      header: 'Đánh giá', accessor: 'rating', render: (v) => (
        <span className={styles.stars}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={13} fill={i < v ? 'currentColor' : 'none'} strokeWidth={i < v ? 0 : 1.5} className={i < v ? styles.starFilled : styles.starEmpty} />
          ))}
        </span>
      ),
    },
    {
      header: 'Nội dung', accessor: 'comment', render: (v) => <p className={styles.comment}>{v || <em className={styles.noComment}>Không có nội dung</em>}</p>,
    },
    {
      header: 'Ngày', accessor: 'createdAt', render: (v) => <span className={styles.date}>{new Date(v).toLocaleDateString('vi-VN')}</span>,
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Kiểm duyệt đánh giá" subtitle={`${total} đánh giá trên toàn nền tảng`} />

      <div className={styles.hintBox}>
        <span className={styles.hintIcon}><MessageSquareWarning size={16} /></span>
        <p>Dùng trang này để gỡ bỏ các đánh giá vi phạm (spam, xúc phạm, sai sự thật...). Khi xóa, hệ thống sẽ <strong>tự tính lại điểm đánh giá trung bình</strong> của địa điểm liên quan và gửi thông báo cho người viết kèm lý do.</p>
      </div>

      <DataTable
        columns={columns}
        data={reviews}
        loading={loading}
        searchPlaceholder="Tìm theo địa điểm, người đánh giá..."
        emptyText="Chưa có đánh giá nào trên nền tảng"
        server={{ page, totalPages, total, pageSize: PAGE_SIZE, onPageChange: handlePageChange, onSearchChange: handleSearchChange }}
        actions={(row) => <Button size="xs" variant="danger" title="Xóa đánh giá" onClick={() => setDeleteTarget(row)}><Trash2 size={13} /></Button>}
      />

      <ReasonModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Xóa đánh giá"
        description={`Xóa đánh giá của "${deleteTarget?.reviewerName || 'người dùng này'}" về "${deleteTarget?.venueName || 'địa điểm này'}"? Điểm đánh giá trung bình sẽ được tính lại ngay sau khi xóa.`}
        icon={<Trash2 size={28} />}
        variant="danger"
        confirmLabel="Xóa đánh giá"
        reasonRequired
        reasonPlaceholder="Ví dụ: Nội dung xúc phạm, spam, không liên quan đến trải nghiệm thực tế..."
      />
    </div>
  )
}
