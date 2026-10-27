import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Users, UserCheck, Clock, Ban, Lightbulb, Lock, Unlock, ShieldCheck, ShieldAlert, ArrowRight } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import SearchFilter from '@/components/dashboard/SearchFilter/SearchFilter'
import Button from '@/components/ui/Button/Button'
import { userService, statsService } from '@/services/notificationService'
import { useToast } from '@/contexts/ToastContext'
import styles from './UserManagement.module.css'

const PAGE_SIZE = 10

export default function UserManagement() {
  const { toast } = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, banned: 0 })
  const [banTarget, setBanTarget] = useState(null)

  const loadUsers = useCallback((p = page, r = roleFilter, s = search) => {
    setLoading(true)
    userService.getUsers({ page: p, limit: PAGE_SIZE, role: r || undefined, search: s })
      .then((res) => {
        setUsers(res.users || [])
        setTotalPages(res.totalPages || 1)
        setTotal(res.total || 0)
      })
      .catch(() => toast.error('Không thể tải danh sách người dùng'))
      .finally(() => setLoading(false))
  }, [])

  const loadStats = useCallback(() => {
    statsService.getUserStats().then(setStats).catch(() => {})
  }, [])

  useEffect(() => { loadUsers(1, roleFilter, ''); loadStats() }, [roleFilter])

  const handlePageChange = (p) => { setPage(p); loadUsers(p, roleFilter, search) }
  const handleSearchChange = (s) => { setSearch(s); setPage(1); loadUsers(1, roleFilter, s) }

  const isBanned = (u) => u?.status === 'banned'

  // Khi mở khóa, khôi phục đúng trạng thái trước đó theo vai trò thay vì luôn
  // đưa về "active" — chủ sân (owner) đã được duyệt phải quay lại "verified",
  // không thì sẽ mất dấu hiệu "đã xác minh" trên bảng.
  const toggleBan = async (reason) => {
    try {
      const banning = !isBanned(banTarget)
      const newStatus = banning ? 'banned' : (banTarget.role === 'owner' ? 'verified' : 'active')
      await userService.updateUserStatus(banTarget._id, newStatus, reason)
      toast.success(banning ? 'Đã khóa tài khoản và gửi thông báo' : 'Đã mở khóa tài khoản')
      setBanTarget(null)
      loadUsers(page, roleFilter, search)
      loadStats()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái')
    }
  }

  const ROLE_LABEL = { customer: 'Khách hàng', owner: 'Chủ sân' }

  const columns = [
    { header: 'Người dùng', accessor: 'name', render: (val, row) => <div className={styles.userCell}><div className={styles.avatar}>{val?.[0] || '?'}</div><div><p className={styles.name}>{val}</p><p className={styles.email}>{row.email}</p></div></div> },
    { header: 'Vai trò', accessor: 'role', render: v => <span className={`${styles.role} ${styles[v]}`}>{ROLE_LABEL[v] || v}</span> },
    { header: 'Trạng thái TK', accessor: 'status', render: v => <StatusBadge status={v} /> },
    {
      header: 'Hồ sơ chủ sân',
      accessor: 'ownerApplicationStatus',
      render: (v) => {
        // Cột này CHỈ nói về hồ sơ đăng ký làm chủ sân — khác hoàn toàn với
        // "Trạng thái TK" ở cột trước. Việc duyệt hồ sơ chỉ thực hiện ở trang
        // "Chủ sân", không làm được ở đây, nên chỉ hiện link dẫn sang đó.
        if (!v || v === 'none') return <span className={styles.noApp}>—</span>
        return (
          <Link to="/admin/owners" className={styles.appLink}>
            <StatusBadge status={v} />
            {v === 'pending' && <span className={styles.appLinkHint}>Duyệt tại trang Chủ sân <ArrowRight size={11} /></span>}
          </Link>
        )
      },
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Quản lý người dùng" subtitle={`${stats.total} người dùng đã đăng ký`} />

      <div className={styles.hintBox}>
        <span className={styles.hintIcon}><Lightbulb size={16} /></span>
        <p><strong>Khóa</strong> = cấm tài khoản đăng nhập và sử dụng hệ thống (ban) cho đến khi được <strong>Mở khóa</strong>. Khi khóa, bắt buộc nhập lý do — người dùng sẽ nhận được thông báo kèm lý do đó. Cột <strong>"Trạng thái TK"</strong> chỉ nói về tài khoản (hoạt động/bị khóa...), <strong>không phải</strong> trạng thái hồ sơ đăng ký làm chủ sân — muốn duyệt hồ sơ chủ sân, xem cột <strong>"Hồ sơ chủ sân"</strong> và bấm vào để sang trang <strong>Chủ sân</strong>.</p>
      </div>

      <div className={styles.statsRow}>
        <StatCard icon={<Users size={18} />} label="Tổng người dùng" value={stats.total} color="primary" />
        <StatCard icon={<UserCheck size={18} />} label="Đang hoạt động" value={stats.active} color="accent" />
        <StatCard icon={<Clock size={18} />} label="Chờ duyệt" value={stats.pending} color="secondary" />
        <StatCard icon={<Ban size={18} />} label="Bị khóa" value={stats.banned} color="error" />
      </div>

      <SearchFilter filters={[{ value: roleFilter, onChange: setRoleFilter, placeholder: 'Tất cả vai trò', options: [{ value: 'customer', label: 'Khách hàng' }, { value: 'owner', label: 'Chủ sân' }] }]} />

      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        searchPlaceholder="Tìm theo tên, email..."
        emptyText="Chưa có người dùng nào"
        server={{ page, totalPages, total, pageSize: PAGE_SIZE, onPageChange: handlePageChange, onSearchChange: handleSearchChange }}
        actions={(row) => <Button size="xs" variant={isBanned(row) ? 'success' : 'danger'} icon={isBanned(row) ? <Unlock size={13} /> : <Lock size={13} />} onClick={() => setBanTarget(row)}>{isBanned(row) ? 'Mở khóa' : 'Khóa'}</Button>}
      />

      <ReasonModal
        isOpen={!!banTarget}
        onClose={() => setBanTarget(null)}
        onConfirm={toggleBan}
        title={isBanned(banTarget) ? 'Mở khóa người dùng' : 'Khóa người dùng'}
        description={isBanned(banTarget)
          ? `Mở khóa tài khoản "${banTarget?.name}"? Người dùng sẽ đăng nhập và sử dụng lại được bình thường.`
          : `Khóa tài khoản "${banTarget?.name}"? Người dùng sẽ không thể đăng nhập cho đến khi được mở khóa.`}
        confirmLabel="Xác nhận"
        variant={isBanned(banTarget) ? 'success' : 'danger'}
        icon={isBanned(banTarget) ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
        reasonRequired={!isBanned(banTarget)}
        reasonPlaceholder="Ví dụ: Spam đánh giá, dùng thông tin giả, vi phạm điều khoản sử dụng..."
      />
    </div>
  )
}
