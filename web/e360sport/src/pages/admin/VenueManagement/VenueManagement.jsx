import { useState, useEffect, useCallback } from 'react'
import { LandPlot, CheckCircle2, PauseCircle, AlertTriangle, Trophy, MapPin, Trash2, Ban, Play, Lightbulb, Megaphone } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import Button from '@/components/ui/Button/Button'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import { getSport, getImageUrl } from '@/utils'
import styles from './VenueManagement.module.css'

const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=100&h=100&fit=crop'
const PAGE_SIZE = 10

export default function VenueManagement() {
  const { toast } = useToast()
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, noCourt: 0 })
  const [warnTarget, setWarnTarget] = useState(null)
  const [suspendTarget, setSuspendTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const loadVenues = useCallback((p = page, s = search) => {
    setLoading(true)
    venueService.getAllVenuesAdmin({ page: p, limit: PAGE_SIZE, search: s })
      .then((res) => {
        setVenues(res.venues || [])
        setTotalPages(res.totalPages || 1)
        setTotal(res.total || 0)
      })
      .catch(() => toast.error('Không thể tải danh sách địa điểm'))
      .finally(() => setLoading(false))
  }, [])

  const loadStats = useCallback(() => {
    venueService.getVenueStatsAdmin().then(setStats).catch(() => {})
  }, [])

  useEffect(() => { loadVenues(1, ''); loadStats() }, [])

  const handlePageChange = (p) => { setPage(p); loadVenues(p, search) }
  const handleSearchChange = (s) => { setSearch(s); setPage(1); loadVenues(1, s) }

  const refreshAfterAction = () => { loadVenues(page, search); loadStats() }

  const handleWarn = async (reason) => {
    try {
      await venueService.warnVenueOwner(warnTarget._id, reason)
      toast.success('Đã gửi cảnh báo đến chủ sân')
      setWarnTarget(null)
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi cảnh báo')
    }
  }

  const handleToggleSuspend = async (reason) => {
    try {
      const suspending = suspendTarget.isActive
      await venueService.adminToggleVenueStatus(suspendTarget._id, reason)
      toast.success(suspending ? 'Đã tạm ngưng địa điểm và thông báo cho chủ sân' : 'Đã kích hoạt lại địa điểm')
      setSuspendTarget(null)
      refreshAfterAction()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái')
    }
  }

  const handleDelete = async (reason) => {
    try {
      await venueService.adminDeleteVenue(deleteTarget._id, reason)
      toast.success('Đã xóa địa điểm và thông báo cho chủ sân')
      setDeleteTarget(null)
      refreshAfterAction()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa địa điểm')
    }
  }

  const columns = [
    {
      header: 'Địa điểm', accessor: 'name', render: (val, row) => (
        <div className={styles.venueCell}>
          <img src={getImageUrl(row.images?.[0]) || PLACEHOLDER_IMG} alt={val} className={styles.thumb} />
          <div className={styles.venueInfo}>
            <p className={styles.venueName}>{val}</p>
            <p className={styles.venueAddr}><MapPin size={11} /> {row.address?.district}, {row.address?.city}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Chủ sân', accessor: 'ownerName', render: (val, row) => (
        <div>
          <p className={styles.ownerName}>{val || 'Không rõ'}</p>
          <p className={styles.ownerEmail}>{row.ownerEmail}</p>
        </div>
      ),
    },
    {
      header: 'Môn thể thao', accessor: 'sports', render: (val) => (
        <span className={styles.sportsCell}><Trophy size={12} /> {(val || []).map(s => getSport(s)?.name || s).join(', ') || '—'}</span>
      ),
    },
    {
      header: 'Số sân', accessor: 'courtCount', render: (val) => (
        val > 0 ? <span>{val} sân</span> : <span className={styles.noCourtWarning}><AlertTriangle size={12} /> Chưa có sân</span>
      ),
    },
    { header: 'Trạng thái', accessor: 'isActive', render: v => <StatusBadge status={v ? 'active' : 'inactive'} /> },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Quản lý địa điểm" subtitle={`${stats.total} địa điểm trên toàn nền tảng`} />

      <div className={styles.hintBox}>
        <span className={styles.hintIcon}><Lightbulb size={16} /></span>
        <p>Quy trình xử lý địa điểm có vấn đề: <strong>1. Cảnh báo</strong> (chỉ gửi thông báo, chưa đổi trạng thái) → nếu chủ sân không cải thiện thì <strong>2. Tạm ngưng</strong> (ẩn khỏi khách hàng, có thể kích hoạt lại) → nếu vẫn không cải thiện thì <strong>3. Xóa</strong> (vĩnh viễn, không hoàn tác được). Cả 3 bước đều tự động gửi thông báo kèm lý do cho chủ sân.</p>
      </div>

      <div className={styles.statsRow}>
        <StatCard icon={<LandPlot size={18} />} label="Tổng địa điểm" value={stats.total} color="primary" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Đang hoạt động" value={stats.active} color="accent" />
        <StatCard icon={<PauseCircle size={18} />} label="Đang tạm ngưng" value={stats.suspended} color="secondary" />
        <StatCard icon={<AlertTriangle size={18} />} label="Chưa có sân nào" value={stats.noCourt} color="error" />
      </div>

      <DataTable
        columns={columns}
        data={venues}
        loading={loading}
        searchPlaceholder="Tìm theo tên địa điểm, chủ sân..."
        emptyText="Chưa có địa điểm nào trên nền tảng"
        server={{ page, totalPages, total, pageSize: PAGE_SIZE, onPageChange: handlePageChange, onSearchChange: handleSearchChange }}
        actions={(row) => (
          <>
            <Button size="xs" variant="outline" title="Gửi cảnh báo cho chủ sân" onClick={() => setWarnTarget(row)}><Megaphone size={13} /></Button>
            <Button size="xs" variant={row.isActive ? 'outline' : 'success'} title={row.isActive ? 'Tạm ngưng' : 'Kích hoạt'} onClick={() => setSuspendTarget(row)}>
              {row.isActive ? <Ban size={13} /> : <Play size={13} />}
            </Button>
            <Button size="xs" variant="danger" title="Xóa vĩnh viễn" onClick={() => setDeleteTarget(row)}><Trash2 size={13} /></Button>
          </>
        )}
      />

      <ReasonModal
        isOpen={!!warnTarget}
        onClose={() => setWarnTarget(null)}
        onConfirm={handleWarn}
        title="Gửi cảnh báo cho chủ sân"
        description={`Gửi thông báo cảnh báo đến chủ sân của "${warnTarget?.name}". Địa điểm vẫn hiển thị bình thường với khách hàng — bước này chỉ để nhắc chủ sân khắc phục vấn đề trước khi bị tạm ngưng.`}
        icon={<Megaphone size={28} />}
        variant="secondary"
        confirmLabel="Gửi cảnh báo"
        reasonRequired
        reasonPlaceholder="Ví dụ: Khách hàng phản ánh địa điểm không có thật / thông tin sai lệch..."
      />

      <ReasonModal
        isOpen={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        onConfirm={handleToggleSuspend}
        title={suspendTarget?.isActive ? 'Tạm ngưng địa điểm' : 'Kích hoạt lại địa điểm'}
        description={suspendTarget?.isActive
          ? `Tạm ngưng "${suspendTarget?.name}"? Địa điểm sẽ bị ẩn khỏi khách hàng ngay lập tức. Bạn có thể kích hoạt lại bất cứ lúc nào.`
          : `Kích hoạt lại "${suspendTarget?.name}"? Địa điểm sẽ hiển thị với khách hàng trở lại.`}
        icon={suspendTarget?.isActive ? <PauseCircle size={28} /> : <Play size={28} />}
        variant={suspendTarget?.isActive ? 'danger' : 'success'}
        confirmLabel="Xác nhận"
        reasonRequired={!!suspendTarget?.isActive}
        reasonPlaceholder="Ví dụ: Đã cảnh báo ngày .../.../..., chủ sân chưa khắc phục..."
      />

      <ReasonModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Xóa địa điểm vĩnh viễn"
        description={`Xóa "${deleteTarget?.name}" khỏi nền tảng? Toàn bộ sân con thuộc địa điểm này cũng sẽ bị xóa. Hành động này KHÔNG THỂ hoàn tác. Các lượt đặt sân đã có trước đó sẽ vẫn được giữ lại trong lịch sử.`}
        icon={<Trash2 size={28} />}
        variant="danger"
        confirmLabel="Xóa vĩnh viễn"
        reasonRequired
        reasonPlaceholder="Ví dụ: Đã tạm ngưng ngày .../.../..., chủ sân không phản hồi/khắc phục..."
      />
    </div>
  )
}
