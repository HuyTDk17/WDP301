import { useState, useEffect, useCallback, useRef } from 'react'
import { Percent, ClipboardList, Banknote } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import { bookingService } from '@/services/bookingService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate } from '@/utils'
import styles from './CommissionReport.module.css'

const PAGE_SIZE = 15

/**
 * Hoa hồng nền tảng thu được trên từng lượt đặt — CHỈ ĐỌC.
 *
 * Quản trị viên chỉ vận hành hệ thống và thu hoa hồng; việc đặt sân, thanh toán,
 * hoàn tiền, chuyển sân là giữa khách và chủ sân nên trang này cố ý không hiện
 * thông tin khách. Hoa hồng được thu qua hoá đơn đối soát (menu "Đối soát hoa hồng").
 */
export default function CommissionReport() {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [summary, setSummary] = useState({ bookings: 0, gmv: 0, commission: 0 })
  const [, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const query = useRef({ page: 1, search: '', month: '' })

  const load = useCallback((patch = {}) => {
    query.current = { ...query.current, ...patch }
    const { page: p, search: s, month: m } = query.current
    setLoading(true)
    bookingService.getCommissionReport({ page: p, limit: PAGE_SIZE, search: s, month: m })
      .then((res) => {
        setRows(res.bookings || [])
        setTotalPages(res.totalPages || 1)
        setSummary(res.summary || { bookings: 0, gmv: 0, commission: 0 })
      })
      .catch(() => toast.error('Không thể tải báo cáo hoa hồng'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const columns = [
    { header: 'Địa điểm', accessor: 'venueName', render: (v, r) => `${v || 'N/A'}${r.courtName ? ` – ${r.courtName}` : ''}` },
    { header: 'Chủ sân', accessor: 'ownerName', render: (v) => v || 'N/A' },
    { header: 'Ngày', accessor: 'date', render: (v) => formatDate(v) },
    { header: 'Giá sân', accessor: 'amount', render: (v) => formatCurrency(v) },
    { header: 'Tỉ lệ', accessor: 'commissionRate', render: (v) => (v || v === 0 ? `${v}%` : '—') },
    { header: 'Hoa hồng', accessor: 'commission', render: (v) => <strong>{formatCurrency(v || 0)}</strong> },
    { header: 'Trạng thái', accessor: 'status', render: (v) => <StatusBadge status={v} /> },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Hoa hồng theo đơn" subtitle="Hoa hồng nền tảng thu được trên từng lượt đặt sân (chỉ xem)" />

      <div className={styles.stats}>
        <StatCard icon={<ClipboardList size={18} />} label="Lượt đặt tính hoa hồng" value={summary.bookings.toLocaleString('vi-VN')} color="primary" />
        <StatCard icon={<Banknote size={18} />} label="Tổng giá sân" value={formatCurrency(summary.gmv)} color="secondary" />
        <StatCard icon={<Percent size={18} />} label="Tổng hoa hồng" value={formatCurrency(summary.commission)} color="success" />
      </div>

      <div className={styles.toolbar}>
        <label>
          Tháng
          <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); load({ month: e.target.value, page: 1 }) }} />
        </label>
        {month && <button type="button" className={styles.note} onClick={() => { setMonth(''); setPage(1); load({ month: '', page: 1 }) }}>Xem tất cả các tháng</button>}
        <span className={styles.note}>Chỉ tính đơn đã xác nhận / hoàn tất / khách không đến. Đơn chủ sân tự tạo tại quầy và đơn đã chuyển đi không có hoa hồng.</span>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Tìm theo địa điểm hoặc chủ sân..."
        emptyText="Chưa có lượt đặt nào phát sinh hoa hồng"
        server={{
          page, totalPages, total: summary.bookings, pageSize: PAGE_SIZE,
          onPageChange: (p) => { setPage(p); load({ page: p }) },
          onSearchChange: (s) => { setSearch(s); setPage(1); load({ search: s, page: 1 }) },
        }}
      />
    </div>
  )
}
