import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Network, Check, X, UserMinus, Info } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import Button from '@/components/ui/Button/Button'
import { networkService } from '@/services/networkService'
import { useToast } from '@/contexts/ToastContext'
import { formatDate } from '@/utils'
import f from '@/components/dashboard/form.module.css'
import styles from './NetworkManagement.module.css'

const PAGE_SIZE = 10
const TABS = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Thành viên' },
  { value: 'none', label: 'Chưa tham gia' },
  { value: 'rejected', label: 'Bị từ chối' },
  { value: 'revoked', label: 'Đã gỡ' },
  { value: '', label: 'Tất cả', stat: 'total' },
]

export default function NetworkManagement() {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({})
  const [required, setRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState('')
  const [reasonAction, setReasonAction] = useState(null)   // { owner, action: 'reject'|'revoke' }
  const [approveAllOpen, setApproveAllOpen] = useState(false)

  const load = useCallback((p, t, s) => {
    setLoading(true)
    networkService.adminList({ page: p, limit: PAGE_SIZE, status: t || undefined, search: s || undefined })
      .then((res) => {
        setRows(res.owners || []); setStats(res.stats || {}); setRequired(!!res.required)
        setTotalPages(res.totalPages || 1); setTotal(res.total || 0)
      })
      .catch(() => toast.error('Không thể tải danh sách chủ sân'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load(1, 'pending', '') }, [load])

  const changeTab = (t) => { setTab(t); setPage(1); load(1, t, search) }
  const changePage = (p) => { setPage(p); load(p, tab, search) }
  const changeSearch = (s) => { setSearch(s); setPage(1); load(1, tab, s) }
  const reload = () => load(page, tab, search)

  const review = async (owner, action, reason = '') => {
    setBusy(owner._id)
    try {
      await networkService.adminReview(owner._id, action, reason)
      toast.success({ approve: 'Đã duyệt vào mạng lưới', reject: 'Đã từ chối yêu cầu', revoke: 'Đã gỡ khỏi mạng lưới' }[action])
      return true
    } catch (err) {
      toast.error(err?.message || 'Thao tác không thành công')
      return false
    } finally {
      setBusy('')
      reload()
    }
  }

  const approveAll = async () => {
    setApproveAllOpen(false)
    try {
      const { approved } = await networkService.adminApprovePending()
      toast.success(approved ? `Đã duyệt ${approved} chủ sân` : 'Không có yêu cầu nào đang chờ')
    } catch (err) {
      toast.error(err?.message || 'Không thể duyệt hàng loạt')
    }
    reload()
  }

  const columns = [
    { header: 'Chủ sân', accessor: 'name', render: (v, o) => (<div><p className={f.cellTitle}>{v}</p><p className={f.cellSub}>{o.email}{o.phone ? ` · ${o.phone}` : ''}</p></div>) },
    { header: 'Trạng thái', accessor: 'status', render: (v) => <StatusBadge status={v} /> },
    { header: 'Gửi yêu cầu', accessor: 'requestedAt', render: (v) => <span className={f.cellSub}>{v ? formatDate(v) : '—'}</span> },
    { header: 'Xử lý', accessor: 'reviewedAt', render: (v, o) => (<div><span className={f.cellSub}>{v ? formatDate(v) : '—'}</span>{o.note && <p className={f.cellSub}>{o.note}</p>}</div>) },
  ]

  return (
    <div>
      <PageHeader
        title="Mạng lưới chuyển sân"
        subtitle="Duyệt chủ sân vào mạng lưới đối tác. Khi bật chế độ bắt buộc, khách chỉ chuyển được lượt đặt sang chủ sân khác nếu cả hai chủ sân đều là thành viên."
      />

      <div className={`${styles.policy} ${required ? styles.policyOn : ''}`}>
        <Info size={16} />
        <p>
          {required
            ? <>Chế độ bắt buộc đang <strong>BẬT</strong>: chỉ chủ sân được duyệt mới tham gia chuyển sân liên chủ sân. Đổi giờ, đổi sân trong cùng chủ sân không bị ảnh hưởng.</>
            : <>Chế độ bắt buộc đang <strong>TẮT</strong>: mọi chủ sân tự động tham gia, việc duyệt dưới đây chưa có tác dụng. Bật trong <Link to="/admin/settings">Cài đặt → Chuyển sân</Link> khi đã sẵn sàng.</>}
        </p>
      </div>

      <div className={f.tabs}>
        {TABS.map((t) => (
          <button key={t.value} type="button" className={`${f.tab} ${tab === t.value ? f.tabActive : ''}`} onClick={() => changeTab(t.value)}>
            {t.label} <span className={styles.count}>{stats[t.stat || t.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        pageSize={PAGE_SIZE}
        searchPlaceholder="Tìm theo tên hoặc email chủ sân..."
        emptyText="Không có chủ sân nào"
        emptyIcon={<Network size={40} />}
        headerRight={stats.pending > 0 ? <Button icon={<Check size={15} />} onClick={() => setApproveAllOpen(true)}>Duyệt tất cả chờ duyệt ({stats.pending})</Button> : null}
        server={{ page, totalPages, total, onPageChange: changePage, onSearchChange: changeSearch }}
        actions={(o) => (
          <>
            {o.status !== 'approved' && (
              <Button size="xs" variant="success" icon={<Check size={13} />} loading={busy === o._id} onClick={() => review(o, 'approve')}>Duyệt</Button>
            )}
            {o.status === 'pending' && <Button size="xs" variant="danger" icon={<X size={13} />} onClick={() => setReasonAction({ owner: o, action: 'reject' })}>Từ chối</Button>}
            {o.status === 'approved' && <Button size="xs" variant="danger" icon={<UserMinus size={13} />} onClick={() => setReasonAction({ owner: o, action: 'revoke' })}>Gỡ</Button>}
          </>
        )}
      />

      <ReasonModal
        isOpen={!!reasonAction}
        onClose={() => setReasonAction(null)}
        onConfirm={async (reason) => { const { owner, action } = reasonAction; if (await review(owner, action, reason)) setReasonAction(null) }}
        title={reasonAction?.action === 'revoke' ? 'Gỡ khỏi mạng lưới' : 'Từ chối yêu cầu'}
        description={reasonAction?.action === 'revoke'
          ? `Gỡ "${reasonAction?.owner.name}" khỏi mạng lưới? Chuyển sang chủ sân khác sẽ không còn áp dụng với địa điểm của họ (các lượt đang giữa chừng ở bước thanh toán không bị ảnh hưởng).`
          : `Từ chối yêu cầu của "${reasonAction?.owner.name}"? Họ có thể gửi lại sau khi cải thiện.`}
        confirmLabel={reasonAction?.action === 'revoke' ? 'Gỡ khỏi mạng lưới' : 'Từ chối'}
        variant="danger"
        reasonLabel="Lý do (gửi kèm thông báo cho chủ sân)"
        reasonPlaceholder="Ví dụ: Chưa đủ giấy tờ / nhiều lần hủy kèo của khách..."
      />
      <ConfirmModal
        isOpen={approveAllOpen}
        onClose={() => setApproveAllOpen(false)}
        onConfirm={approveAll}
        title="Duyệt tất cả yêu cầu đang chờ"
        message={`Duyệt ${stats.pending || 0} chủ sân đang chờ vào mạng lưới? Mỗi người sẽ nhận thông báo.`}
        confirmLabel="Duyệt tất cả"
      />
    </div>
  )
}
