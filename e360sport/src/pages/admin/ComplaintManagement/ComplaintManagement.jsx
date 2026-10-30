import { useState, useEffect, useCallback } from 'react'
import { MessageSquareWarning, Play, Send, CheckCircle2, XCircle } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { complaintService, complaintCategoryLabel } from '@/services/complaintService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, getImageUrl } from '@/utils'
import styles from './ComplaintManagement.module.css'

const PAGE_SIZE = 10
const TABS = [
  { value: '', label: 'Tất cả', stat: 'total' },
  { value: 'open', label: 'Chờ xử lý', stat: 'open' },
  { value: 'investigating', label: 'Đang xử lý', stat: 'investigating' },
  { value: 'resolved', label: 'Đã giải quyết', stat: 'resolved' },
  { value: 'rejected', label: 'Từ chối', stat: 'rejected' },
]

export default function ComplaintManagement() {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // 'customer' | 'owner' | 'resolved' | 'rejected' — hành động đang mở hộp nhập nội dung
  const [action, setAction] = useState(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback((p, t, s) => {
    setLoading(true)
    complaintService.adminList({ page: p, limit: PAGE_SIZE, status: t || undefined, search: s || undefined })
      .then((res) => {
        setRows(res.complaints || [])
        setTotalPages(res.totalPages || 1)
        setTotal(res.total || 0)
        setStats(res.stats || {})
      })
      .catch(() => toast.error('Không thể tải danh sách khiếu nại'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(1, '', '') }, [load])

  const changeTab = (t) => { setTab(t); setPage(1); load(1, t, search) }
  const changePage = (p) => { setPage(p); load(p, tab, search) }
  const changeSearch = (s) => { setSearch(s); setPage(1); load(1, tab, s) }
  const reload = () => load(page, tab, search)

  const openDetail = (row) => {
    setDetail(row)
    setDetailLoading(true)
    complaintService.adminGet(row._id)
      .then((res) => setDetail(res.complaint))
      .catch(() => toast.error('Không thể tải chi tiết khiếu nại'))
      .finally(() => setDetailLoading(false))
  }

  const run = async (fn, okMsg) => {
    try {
      const res = await fn()
      toast.success(okMsg)
      setDetail((d) => ({ ...d, ...res.complaint, customerId: d.customerId, ownerId: d.ownerId, bookingId: d.bookingId }))
      reload()
      return true
    } catch (err) {
      toast.error(err?.message || 'Thao tác không thành công')
      return false
    }
  }

  const handleStart = async () => {
    setStarting(true)
    await run(() => complaintService.adminStart(detail._id), 'Đã nhận xử lý khiếu nại')
    setStarting(false)
  }

  const handleAction = async (text) => {
    const ok = action === 'customer' || action === 'owner'
      ? await run(() => complaintService.adminContact(detail._id, action, text), action === 'customer' ? 'Đã gửi tin cho khách hàng' : 'Đã gửi tin cho chủ sân')
      : await run(() => complaintService.adminResolve(detail._id, action, text), action === 'resolved' ? 'Đã giải quyết khiếu nại và thông báo cho khách' : 'Đã từ chối khiếu nại và thông báo cho khách')
    if (ok) setAction(null)
  }

  const columns = [
    { header: 'Khiếu nại', accessor: 'subject', render: (v, row) => (<div><p className={styles.subject}>{v}</p><p className={styles.sub}>{row.venueName} · {complaintCategoryLabel(row.category)}</p></div>) },
    { header: 'Khách hàng', accessor: 'customerId', render: (c) => (<div><p className={styles.subject}>{c?.name || '—'}</p><p className={styles.sub}>{c?.email}</p></div>) },
    { header: 'Chủ sân', accessor: 'ownerId', render: (o) => <span className={styles.sub}>{o?.name || '—'}</span> },
    { header: 'Trạng thái', accessor: 'status', render: (v) => <StatusBadge status={v} /> },
    { header: 'Ngày gửi', accessor: 'createdAt', render: (v) => <span className={styles.sub}>{formatDate(v)}</span> },
  ]

  const isOpen = detail && ['open', 'investigating'].includes(detail.status)
  const ACTION_CFG = {
    customer: { title: 'Gửi tin cho khách hàng', desc: 'Tin nhắn sẽ gửi tới khách dưới dạng thông báo và hiển thị trong chi tiết khiếu nại.', label: 'Nội dung gửi khách', confirm: 'Gửi cho khách', variant: 'primary', placeholder: 'Ví dụ: Bạn vui lòng cung cấp thêm ảnh biên lai chuyển khoản...' },
    owner: { title: 'Gửi tin cho chủ sân', desc: 'Chủ sân nhận thông báo yêu cầu làm rõ. Danh tính khách hàng không được tiết lộ.', label: 'Nội dung gửi chủ sân', confirm: 'Gửi cho chủ sân', variant: 'primary', placeholder: 'Ví dụ: Vui lòng giải trình về việc chưa hoàn tiền cho lượt đặt này...' },
    resolved: { title: 'Giải quyết khiếu nại', desc: 'Khiếu nại được đánh dấu đã giải quyết. Phản hồi bên dưới sẽ gửi tới khách hàng.', label: 'Phản hồi gửi khách hàng', confirm: 'Giải quyết', variant: 'success', placeholder: 'Ví dụ: Chúng tôi đã yêu cầu chủ sân hoàn lại 100% tiền sân...' },
    rejected: { title: 'Từ chối khiếu nại', desc: 'Khiếu nại bị đóng do không đủ cơ sở. Hãy nêu rõ lý do để khách hiểu.', label: 'Lý do gửi khách hàng', confirm: 'Từ chối khiếu nại', variant: 'danger', placeholder: 'Ví dụ: Chưa đủ bằng chứng để xác nhận lỗi từ phía chủ sân...' },
  }
  const cfg = action ? ACTION_CFG[action] : null

  return (
    <div>
      <PageHeader title="Khiếu nại" subtitle={`${stats.open || 0} chờ xử lý · ${stats.investigating || 0} đang xử lý · ${stats.total || 0} tổng cộng`} />

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.value} type="button" className={`${styles.tab} ${tab === t.value ? styles.tabActive : ''}`} onClick={() => changeTab(t.value)}>
            {t.label}<span className={styles.count}>{stats[t.stat] || 0}</span>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        pageSize={PAGE_SIZE}
        searchPlaceholder="Tìm theo tiêu đề, địa điểm, tên/email khách..."
        emptyText="Không có khiếu nại nào"
        emptyIcon={<MessageSquareWarning size={40} />}
        onRowClick={openDetail}
        server={{ page, totalPages, total, onPageChange: changePage, onSearchChange: changeSearch }}
      />

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title="Chi tiết khiếu nại" size="lg" footer={isOpen ? (
        <div className={styles.footer}>
          {detail.status === 'open' && <Button variant="outline" icon={<Play size={14} />} onClick={handleStart} loading={starting}>Nhận xử lý</Button>}
          <Button variant="outline" icon={<Send size={14} />} onClick={() => setAction('customer')}>Nhắn khách</Button>
          <Button variant="outline" icon={<Send size={14} />} onClick={() => setAction('owner')}>Nhắn chủ sân</Button>
          <Button variant="danger" icon={<XCircle size={14} />} onClick={() => setAction('rejected')}>Từ chối</Button>
          <Button variant="primary" icon={<CheckCircle2 size={14} />} onClick={() => setAction('resolved')}>Giải quyết</Button>
        </div>
      ) : null}>
        {detail && (
          <div className={styles.detail}>
            <div className={styles.head}>
              <h3 className={styles.title}>{detail.subject}</h3>
              <StatusBadge status={detail.status} />
            </div>
            <p className={styles.sub}>{detail.venueName} · {complaintCategoryLabel(detail.category)} · Gửi ngày {formatDate(detail.createdAt)}</p>

            <div className={styles.parties}>
              <div><span className={styles.k}>Khách hàng</span><p>{detail.customerId?.name} · {detail.customerId?.email}{detail.customerId?.phone ? ` · ${detail.customerId.phone}` : ''}</p></div>
              <div><span className={styles.k}>Chủ sân</span><p>{detail.ownerId?.name} · {detail.ownerId?.email}{detail.ownerId?.phone ? ` · ${detail.ownerId.phone}` : ''}</p></div>
              {detail.bookingId && typeof detail.bookingId === 'object' && (
                <div><span className={styles.k}>Lượt đặt liên quan</span><p>{detail.bookingId.courtName} · {formatDate(detail.bookingId.date)} {detail.bookingId.startTime}–{detail.bookingId.endTime} · {formatCurrency(detail.bookingId.amount)} · <StatusBadge status={detail.bookingId.status} dot={false} /></p></div>
              )}
            </div>

            <p className={styles.body}>{detail.description}</p>

            {detail.evidence?.length > 0 && (
              <div className={styles.thumbs}>
                {detail.evidence.map((url) => <a key={url} href={getImageUrl(url)} target="_blank" rel="noreferrer" className={styles.thumb}><img src={getImageUrl(url)} alt="Bằng chứng" /></a>)}
              </div>
            )}
            {detailLoading && <div className={styles.center}><Spinner size="sm" /></div>}

            {detail.messages?.length > 0 && (
              <div className={styles.thread}>
                <p className={styles.k}>Nhật ký liên hệ</p>
                {detail.messages.map((m, i) => (
                  <div key={i} className={styles.msg}>
                    <span className={styles.msgTo}>Gửi {m.to === 'customer' ? 'khách hàng' : 'chủ sân'} · {formatDate(m.createdAt)}</span>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
            )}

            {detail.resolution && (
              <div className={styles.resolution}>
                <p className={styles.k}>Phản hồi đã gửi khách{detail.resolvedBy?.name ? ` (bởi ${detail.resolvedBy.name})` : ''}</p>
                <p className={styles.body}>{detail.resolution}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {cfg && (
        <ReasonModal
          isOpen
          onClose={() => setAction(null)}
          onConfirm={handleAction}
          title={cfg.title}
          description={cfg.desc}
          variant={cfg.variant}
          confirmLabel={cfg.confirm}
          reasonLabel={cfg.label}
          reasonPlaceholder={cfg.placeholder}
        />
      )}
    </div>
  )
}
