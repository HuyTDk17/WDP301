import { useState, useEffect, useCallback } from 'react'
import { Banknote, Check, CircleCheck } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { settlementService } from '@/services/settlementService'
import { REFUND_PURPOSE_LABEL } from '@/services/refundService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/utils'
import styles from './RefundRequests.module.css'

/**
 * Hoàn tiền cho khách — do CHỦ SÂN thực hiện.
 *
 * Khách chuyển tiền đặt sân thẳng vào tài khoản của bạn, nên khi lượt đặt bị huỷ (khách
 * huỷ, bạn huỷ) bạn là người chuyển khoản trả lại phần được hoàn. Chuyển xong trong app
 * ngân hàng, bấm "Đã hoàn tiền" để đóng khoản này và báo cho khách. Quản trị viên không
 * giữ tiền của các đơn này nên không xử lý được.
 */
export default function RefundRequests() {
  const { toast } = useToast()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    settlementService.getOwnerRefunds()
      .then((res) => setPayments(res.payments || []))
      .catch(() => toast.error('Không thể tải danh sách hoàn tiền'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const handleMark = async (p) => {
    setActing(p._id)
    try {
      await settlementService.ownerMarkRefunded(p._id)
      toast.success('Đã ghi nhận hoàn tiền và báo cho khách')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật')
    } finally {
      setActing(null)
    }
  }

  const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
  const customerOf = (p) => {
    const b = p.bookingId
    if (!b) return ''
    return [b.customerId?.name || b.guestName, b.customerId?.phone].filter(Boolean).join(' · ')
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Hoàn tiền cho khách"
        subtitle={payments.length
          ? `${payments.length} khoản cần hoàn · tổng ${formatCurrency(total)}`
          : 'Các khoản bạn cần chuyển khoản trả lại khách (khi lượt đặt bị huỷ) sẽ hiện ở đây'}
      />

      {loading ? (
        <div className={styles.loading}><Spinner size="lg" /></div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<CircleCheck size={48} />}
          title="Không có khoản nào cần hoàn"
          description="Không có khoản hoàn tiền nào đang chờ bạn xử lý."
        />
      ) : (
        <div className={styles.list}>
          {payments.map((p) => (
            <div key={p._id} className={styles.item}>
              <div className={styles.info}>
                <div className={styles.topRow}>
                  <span className={styles.amount}>{formatCurrency(p.amount)}</span>
                  <Badge size="sm" style={{ background: '#FEF3C7', color: '#F59E0B' }}>Chờ bạn hoàn</Badge>
                  <Badge size="sm" style={{ background: '#F1F5F9', color: '#4A5568' }}>{REFUND_PURPOSE_LABEL[p.purpose] || p.purpose}</Badge>
                </div>
                {p.bookingId && <p className={styles.booking}>{p.bookingId.venueName} – {p.bookingId.courtName} · {p.bookingId.date} {p.bookingId.startTime}</p>}
                {customerOf(p) && <p className={styles.reason}>Khách: {customerOf(p)}</p>}
                <p className={styles.reason}>{p.refundReason}</p>
                <p className={styles.meta}>Mã: {p.orderRef} · Tạo lúc {new Date(p.createdAt).toLocaleString('vi-VN')}</p>
              </div>
              <div className={styles.actions}>
                <Button size="sm" icon={<Check size={13} />} loading={acting === p._id} onClick={() => handleMark(p)}>
                  Đã hoàn tiền cho khách
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
