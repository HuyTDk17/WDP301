import { useState, useEffect, useCallback } from 'react'
import { Landmark, Check, X, CircleCheck, Clock } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Modal from '@/components/ui/Modal/Modal'
import { paymentService } from '@/services/bookingService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/utils'
import styles from './PendingBankPayments.module.css'

/**
 * Chuyển khoản đặt sân đang chờ CHỦ SÂN xác nhận.
 *
 * Khách chuyển khoản THẲNG vào tài khoản ngân hàng của chủ sân (cấu hình ở
 * Cài đặt → Thông tin nhận tiền), nên chỉ chủ sân mới biết tiền đã về hay chưa.
 * Mở app ngân hàng, đối chiếu sao kê với danh sách này (khớp NỘI DUNG và SỐ
 * TIỀN), rồi bấm xác nhận hoặc từ chối từng giao dịch. Quản trị viên không xem
 * hay xử lý được các giao dịch này.
 */
export default function PendingBankPayments() {
  const { toast } = useToast()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    paymentService.getOwnerPendingBankPayments()
      .then((res) => setPayments(res.payments || []))
      .catch(() => toast.error('Không thể tải danh sách giao dịch'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleConfirm = async (p) => {
    setActing(p._id)
    try {
      await paymentService.ownerConfirmBankTransfer(p._id)
      toast.success(isTopup(p) ? 'Đã xác nhận — yêu cầu chuyển sân được thực hiện' : 'Đã xác nhận — lượt đặt sân đã được chốt')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể xác nhận')
    } finally {
      setActing(null)
    }
  }

  const handleReject = async () => {
    setActing(rejecting._id)
    try {
      await paymentService.ownerRejectBankTransfer(rejecting._id, rejectReason)
      toast.success('Đã từ chối giao dịch')
      setRejecting(null)
      setRejectReason('')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể từ chối')
    } finally {
      setActing(null)
    }
  }

  const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0)

  const isTopup = (p) => p.purpose === 'transfer_topup'

  const describe = (p) => {
    const t = p.transferId
    // Khoản bù/phí khi khách chuyển sân đến địa điểm của bạn (hoặc sang tên lượt đặt của bạn)
    if (isTopup(p) && t) return `Bù tiền chuyển sân → ${t.toVenueName || ''} ${t.toCourtName ? `– ${t.toCourtName}` : ''} · ${t.toDate} ${t.toStartTime}`
    const b = p.bookingId
    if (!b) return ''
    return `${b.venueName} – ${b.courtName} · ${b.date} ${b.startTime}`
  }

  const customerOf = (p) => {
    if (isTopup(p) && p.transferId?.customerId) {
      return [p.transferId.customerId.name, p.transferId.customerId.phone].filter(Boolean).join(' · ')
    }
    const b = p.bookingId
    if (!b) return ''
    const name = b.customerId?.name || b.guestName
    const phone = b.customerId?.phone || b.guestPhone
    return [name, phone].filter(Boolean).join(' · ')
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Xác nhận chuyển khoản"
        subtitle={payments.length
          ? `${payments.length} giao dịch chờ xác nhận · tổng ${formatCurrency(total)}`
          : 'Khách chuyển khoản đặt sân hoặc bù tiền/phí chuyển sân vào tài khoản của bạn sẽ hiện ở đây để đối chiếu và xác nhận'}
      />

      {loading ? (
        <div className={styles.loading}><Spinner size="lg" /></div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<CircleCheck size={48} />}
          title="Không có giao dịch nào chờ xác nhận"
          description="Mọi giao dịch chuyển khoản đều đã được xử lý."
        />
      ) : (
        <div className={styles.list}>
          {payments.map((p) => (
            <div key={p._id} className={styles.item}>
              <div className={styles.info}>
                <div className={styles.topRow}>
                  <span className={styles.amount}>{formatCurrency(p.amount)}</span>
                  {p.status === 'awaiting_confirmation' ? (
                    <Badge size="sm" style={{ background: '#DBEAFE', color: '#3B82F6' }}>
                      <Check size={11} style={{ marginRight: 3 }} /> Khách báo đã chuyển
                    </Badge>
                  ) : (
                    <Badge size="sm" style={{ background: '#FEF3C7', color: '#F59E0B' }}>
                      <Clock size={11} style={{ marginRight: 3 }} /> Chưa báo
                    </Badge>
                  )}
                </div>
                <p className={styles.booking}>{describe(p)}</p>
                {customerOf(p) && <p className={styles.reason}>Khách: {customerOf(p)}</p>}
                <p className={styles.meta}>
                  Nội dung cần khớp: <span className={styles.orderRef}>{p.orderRef}</span> · Tạo lúc {new Date(p.createdAt).toLocaleString('vi-VN')}
                  {p.customerMarkedPaidAt && <> · Khách báo lúc {new Date(p.customerMarkedPaidAt).toLocaleString('vi-VN')}</>}
                </p>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="outline" size="sm" icon={<X size={13} />}
                  loading={acting === p._id} onClick={() => setRejecting(p)}
                >
                  Từ chối
                </Button>
                <Button
                  size="sm" icon={<Landmark size={13} />}
                  loading={acting === p._id} onClick={() => handleConfirm(p)}
                >
                  Đã nhận tiền — xác nhận
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!rejecting} onClose={() => setRejecting(null)} title="Từ chối giao dịch">
        <p className={styles.contentLabel}>
          Không thấy khoản chuyển khớp trên sao kê? Nêu rõ lý do — hệ thống sẽ báo cho khách, nhả lại khung giờ
          và hoàn lại số dư khuyến mãi/điểm (nếu có) đã giữ chỗ cho đơn này.
        </p>
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder="Ví dụ: Không thấy giao dịch khớp nội dung và số tiền trong tài khoản của tôi"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        <div className={styles.modalActions}>
          <Button variant="outline" onClick={() => setRejecting(null)}>Huỷ</Button>
          <Button onClick={handleReject} loading={acting === rejecting?._id}>Xác nhận từ chối</Button>
        </div>
      </Modal>
    </div>
  )
}
