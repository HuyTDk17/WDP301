import { useState, useEffect, useCallback } from 'react'
import { Check, X, XCircle } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { bookingService } from '@/services/bookingService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, getSport } from '@/utils'
import styles from './ManageBookings.module.css'

const TABS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'cancelled', label: 'Đã hủy' },
]

export default function ManageBookings() {
  const { toast } = useToast()
  const [tab, setTab] = useState('all')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)

  const loadBookings = useCallback(() => {
    setLoading(true)
    const params = tab !== 'all' ? { status: tab } : {}
    bookingService.getOwnerBookings(params)
      .then((res) => setBookings(res.bookings || []))
      .catch(() => toast.error('Không thể tải danh sách lượt đặt sân'))
      .finally(() => setLoading(false))
  }, [tab])

  useEffect(() => { loadBookings() }, [loadBookings])

  const updateStatus = async (id, newStatus) => {
    try {
      await bookingService.updateBookingStatus(id, newStatus)
      toast.success('Đã cập nhật trạng thái lượt đặt')
      setDetail(null)
      loadBookings()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái')
    }
  }

  const handleCancel = () => { updateStatus(cancelTarget._id, 'cancelled'); setCancelTarget(null) }

  const columns = [
    { header: 'Khách hàng', accessor: 'customerId', render: (val) => <div className={styles.customerCell}><div className={styles.avatar}>{val?.name?.[0] || '?'}</div><div><p className={styles.customerName}>{val?.name || 'Khách hàng'}</p><p className={styles.customerPhone}>{val?.phone}</p></div></div> },
    { header: 'Địa điểm / Sân', accessor: 'venueName', render: (v, row) => `${v} · ${row.courtName}` },
    { header: 'Ngày & Giờ', accessor: 'date', render: (v, row) => <div><p>{formatDate(v)}</p><p className={styles.timeText}>{row.startTime}–{row.endTime}</p></div> },
    { header: 'Số tiền', accessor: 'amount', render: v => formatCurrency(v) },
    { header: 'Trạng thái', accessor: 'status', render: v => <StatusBadge status={v} /> },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Quản lý lượt đặt sân" subtitle={`Tổng cộng ${bookings.length} lượt đặt sân`} />
      <div className={styles.tabs}>{TABS.map(t => <button key={t.value} className={`${styles.tab} ${tab === t.value ? styles.tabActive : ''}`} onClick={() => setTab(t.value)}>{t.label}</button>)}</div>

      {loading ? <div className={styles.loadingState}><Spinner size="lg" /></div> : (
        <DataTable
          columns={columns}
          data={bookings}
          searchPlaceholder="Tìm theo tên khách hàng..."
          emptyText="Không có lượt đặt sân nào"
          onRowClick={setDetail}
          actions={(row) => (
            <>
              {row.status === 'pending' && (
                <>
                  <Button size="xs" variant="success" onClick={(e) => { e.stopPropagation(); updateStatus(row._id, 'confirmed') }}><Check size={13} /></Button>
                  <Button size="xs" variant="danger" onClick={(e) => { e.stopPropagation(); setCancelTarget(row) }}><X size={13} /></Button>
                </>
              )}
              {row.status === 'confirmed' && <Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); updateStatus(row._id, 'completed') }}>Đánh dấu xong</Button>}
              <Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetail(row) }}>Xem</Button>
            </>
          )}
        />
      )}

      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title="Chi tiết lượt đặt sân"
        footer={detail?.status === 'pending' ? (<><Button variant="danger" onClick={() => setCancelTarget(detail)}>Hủy lượt đặt</Button><Button variant="success" onClick={() => updateStatus(detail._id, 'confirmed')}>Xác nhận</Button></>) : detail?.status === 'confirmed' ? <Button onClick={() => updateStatus(detail._id, 'completed')}>Đánh dấu hoàn tất</Button> : null}
      >
        {detail && (
          <div className={styles.detailBody}>
            <div className={styles.detailRow}><span>Khách hàng</span><strong>{detail.customerId?.name} ({detail.customerId?.phone})</strong></div>
            <div className={styles.detailRow}><span>Địa điểm</span><strong>{detail.venueName} · {detail.courtName}</strong></div>
            <div className={styles.detailRow}><span>Ngày & Giờ</span><strong>{formatDate(detail.date)} · {detail.startTime}–{detail.endTime}</strong></div>
            <div className={styles.detailRow}><span>Môn thể thao</span><strong>{getSport(detail.sport)?.name || detail.sport}</strong></div>
            {detail.notes && <div className={styles.detailRow}><span>Ghi chú</span><em>{detail.notes}</em></div>}
            <div className={styles.detailRow}><span>Giá sân</span><strong className={styles.amountHighlight}>{formatCurrency(detail.amount)}</strong></div>
            {detail.ownerCommission > 0 && (
              <>
                <div className={styles.detailRow}><span>Phí dịch vụ nền tảng (bạn chịu)</span><strong>−{formatCurrency(detail.ownerCommission)}</strong></div>
                <div className={styles.detailRow}><span>Bạn thực nhận</span><strong className={styles.amountHighlight}>{formatCurrency(detail.amount - detail.ownerCommission)}</strong></div>
              </>
            )}
            <div className={styles.detailRow}><span>Trạng thái</span><StatusBadge status={detail.status} /></div>
          </div>
        )}
      </Modal>

      <ConfirmModal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} title="Hủy lượt đặt sân" message={`Hủy lượt đặt sân của ${cancelTarget?.customerId?.name}? Khách hàng sẽ được thông báo.`} confirmLabel="Hủy lượt đặt" icon={<XCircle size={28} />} />
    </div>
  )
}
