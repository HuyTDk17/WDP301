import { useState, useEffect, useMemo } from 'react'
import { Users } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Spinner from '@/components/ui/Spinner/Spinner'
import { bookingService } from '@/services/bookingService'
import { formatCurrency, formatDate } from '@/utils'
import styles from './Customers.module.css'

// GHI CHÚ: Backend hiện chưa có endpoint riêng "GET /owner/customers".
// Trang này tạm thời suy ra danh sách khách hàng bằng cách gộp nhóm dữ liệu
// từ /owner/bookings (theo customerId) ngay tại frontend. Cách này hoạt động
// tốt với số lượng booking vừa phải; khi dữ liệu lớn hơn, nên chuyển sang
// một aggregate query thật ở backend (MongoDB $group theo customerId) để
// tránh phải tải toàn bộ bookings về client mỗi lần xem trang này.
function deriveCustomers(bookings) {
  const map = new Map()
  bookings.forEach(b => {
    const customer = b.customerId
    if (!customer?._id) return
    const key = customer._id
    if (!map.has(key)) {
      map.set(key, { _id: key, name: customer.name, phone: customer.phone, totalBookings: 0, totalSpent: 0, lastBooking: b.date })
    }
    const entry = map.get(key)
    entry.totalBookings += 1
    if (b.status !== 'cancelled') entry.totalSpent += b.amount || 0
    if (new Date(b.date) > new Date(entry.lastBooking)) entry.lastBooking = b.date
  })
  return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent)
}

export default function Customers() {
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState([])

  useEffect(() => {
    bookingService.getOwnerBookings()
      .then((res) => setBookings(res.bookings || []))
      .finally(() => setLoading(false))
  }, [])

  const customers = useMemo(() => deriveCustomers(bookings), [bookings])

  const columns = [
    { header: 'Khách hàng', accessor: 'name', render: (val, row) => <div className={styles.customerCell}><div className={styles.avatar}>{val?.[0] || '?'}</div><div><p className={styles.name}>{val}</p><p className={styles.phone}>{row.phone}</p></div></div> },
    { header: 'Lượt đặt', accessor: 'totalBookings' },
    { header: 'Tổng chi tiêu', accessor: 'totalSpent', render: v => formatCurrency(v) },
    { header: 'Lần đặt gần nhất', accessor: 'lastBooking', render: v => formatDate(v) },
  ]

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <PageHeader title="Khách hàng" subtitle={`${customers.length} khách hàng đã đặt sân tại địa điểm của bạn`} />
      {customers.length === 0 ? (
        <EmptyState icon={<Users size={48} />} title="Chưa có khách hàng nào" description="Danh sách khách hàng sẽ xuất hiện ở đây khi có người đặt sân của bạn." />
      ) : (
        <DataTable columns={columns} data={customers} searchPlaceholder="Tìm theo tên, số điện thoại..." />
      )}
    </div>
  )
}
