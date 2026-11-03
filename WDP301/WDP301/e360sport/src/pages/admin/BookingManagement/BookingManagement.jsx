import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import { bookingService } from '@/services/bookingService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate } from '@/utils'
import styles from './BookingManagement.module.css'

const PAGE_SIZE = 10

export default function BookingManagement() {
  const { toast } = useToast()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')

  const load = useCallback((p = page, s = search) => {
    setLoading(true)
    bookingService.getAllBookings({ page: p, limit: PAGE_SIZE, search: s })
      .then((res) => {
        setBookings(res.bookings || [])
        setTotalPages(res.totalPages || 1)
        setTotal(res.total || 0)
      })
      .catch(() => toast.error('Không thể tải danh sách lượt đặt sân'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(1, '') }, [load])

  const handlePageChange = (p) => { setPage(p); load(p, search) }
  const handleSearchChange = (s) => { setSearch(s); setPage(1); load(1, s) }

  const columns = [
    { header: 'Khách hàng', accessor: 'customerDisplayName', render: v => v || 'N/A' },
    { header: 'Địa điểm', accessor: 'venueName', render: v => v || 'N/A' },
    { header: 'Ngày', accessor: 'date', render: v => formatDate(v) },
    { header: 'Số tiền', accessor: 'amount', render: v => formatCurrency(v) },
    { header: 'Trạng thái', accessor: 'status', render: v => <StatusBadge status={v} /> },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Tất cả lượt đặt sân" subtitle={`${total} lượt đặt trên toàn nền tảng`} />
      <DataTable
        columns={columns}
        data={bookings}
        loading={loading}
        searchPlaceholder="Tìm theo khách hàng, địa điểm..."
        emptyText="Chưa có lượt đặt sân nào trên hệ thống"
        server={{ page, totalPages, total, pageSize: PAGE_SIZE, onPageChange: handlePageChange, onSearchChange: handleSearchChange }}
      />
    </div>
  )
}
