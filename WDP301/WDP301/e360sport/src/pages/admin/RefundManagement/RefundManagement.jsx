import { useState, useEffect, useCallback } from 'react'
import { Banknote, Check, CircleCheck } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { refundService, REFUND_PURPOSE_LABEL } from '@/services/refundService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/utils'
import styles from './RefundManagement.module.css'

/**
 * Các khoản NỀN TẢNG phải hoàn: chênh lệch khi chuyển sân và giao dịch cũ nhận bằng tài khoản
 * nền tảng. Hoàn tiền của đơn đặt sân (khách chuyển thẳng cho chủ sân) do CHỦ SÂN thực hiện ở
 * mục "Hoàn tiền cho khách" — không hiện ở đây. Chuyển khoản ngân hàng không có API hoàn tự
 * động, nên quản trị viên tự chuyển khoản lại cho khách rồi bấm đánh dấu đã hoàn.
 */
export default function RefundManagement() {
  const { toast } = useToast()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    refundService.getPending()
      .then((res) => setPayments(res.payments || []))
      .catch(() => toast.error('Không thể tải danh sách hoàn tiền'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleMark = async (p) => {
    setActing(p._id)
    try {
      await refundService.markRefunded(p._id)
      toast.success('Đã đánh dấu hoàn tiền xong')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật')
    } finally {
      setActing(null)
    }
  }

  const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0)

  return (
    <div className={styles.page}>
      <PageHeader
        title="Hoàn tiền"
        subtitle={payments.length
          ? `${payments.length} khoản chờ xử lý · tổng ${formatCurrency(total)}`
          : 'Khoản nền tảng phải hoàn (chuyển sân…) sẽ hiện ở đây. Hoàn tiền đơn đặt sân do chủ sân thực hiện.'}
      />

      {loading ? (
        <div className={styles.loading}><Spinner size="lg" /></div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<CircleCheck size={48} />}
          title="Không còn khoản nào chờ xử lý"
          description="Không có khoản chuyển khoản hoàn tiền nào đang chờ xử lý."
        />
      ) : (
        <div className={styles.list}>
          {payments.map((p) => (
            <div key={p._id} className={styles.item}>
              <div className={styles.info}>
                <div className={styles.topRow}>
                  <span className={styles.amount}>{formatCurrency(p.amount)}</span>
                  <Badge size="sm" style={{ background: '#FEF3C7', color: '#F59E0B' }}>Chờ xử lý</Badge>
                  <Badge size="sm" style={{ background: '#F1F5F9', color: '#4A5568' }}>
                    {REFUND_PURPOSE_LABEL[p.purpose] || p.purpose}
                  </Badge>
                </div>
                {p.bookingId && (
                  <p className={styles.booking}>
                    {p.bookingId.venueName} – {p.bookingId.courtName} · {p.bookingId.date} {p.bookingId.startTime}
                  </p>
                )}
                <p className={styles.reason}>{p.refundReason}</p>
                <p className={styles.meta}>
                  Mã: {p.orderRef} · Tạo lúc {new Date(p.createdAt).toLocaleString('vi-VN')}
                </p>
              </div>
              <div className={styles.actions}>
                <Button
                  size="sm" icon={<Check size={13} />}
                  loading={acting === p._id} onClick={() => handleMark(p)}
                >
                  Đã chuyển khoản cho khách
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
