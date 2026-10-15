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
 * Danh sách giao dịch chuyển khoản đang chờ xác nhận.
 *
 * CHỈ gồm các khoản khách chuyển vào tài khoản NỀN TẢNG: tiền bù khi chuyển
 * sân (và giao dịch cũ tạo trước khi đổi cách thu). Chuyển khoản đặt sân đi
 * thẳng vào tài khoản chủ sân và do CHỦ SÂN xác nhận — không hiện ở đây, quản
 * trị viên cũng không xử lý được (backend chặn 403).
 *
 * Quản trị viên mở app ngân hàng, đối chiếu sao kê với danh sách này, rồi bấm
 * xác nhận hoặc từ chối cho từng giao dịch.
 *
 * Nếu bật "đối soát tự động" trong Cài đặt (kèm cấu hình dịch vụ như SePay,
 * Casso ở máy chủ), phần lớn giao dịch sẽ tự biến mất khỏi danh sách này mà
 * không cần thao tác tay.
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
    paymentService.getPendingBankPayments()
      .then((res) => setPayments(res.payments || []))
      .catch(() => toast.error('Không thể tải danh sách giao dịch'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleConfirm = async (p) => {
    setActing(p._id)
    try {
      await paymentService.confirmBankTransfer(p._id)
      toast.success('Đã xác nhận giao dịch')
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
      await paymentService.rejectBankTransfer(rejecting._id, rejectReason)
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

  const describe = (p) => {
    if (p.bookingId) return `${p.bookingId.venueName} – ${p.bookingId.courtName} · ${p.bookingId.date} ${p.bookingId.startTime}`
    if (p.transferId) return `Chuyển sân: ${p.transferId.fromVenueName} → ${p.transferId.toVenueName}`
    return ''
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Thu phí chuyển sân"
        subtitle={payments.length
          ? `${payments.length} giao dịch chờ xác nhận · tổng ${formatCurrency(total)}`
          : 'Khoản bù khi khách chuyển sân (vào tài khoản nền tảng) sẽ hiện ở đây để đối chiếu và xác nhận'}
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
          Không tìm thấy giao dịch khớp trên sao kê? Nêu rõ lý do — hệ thống sẽ báo cho khách và hoàn lại
          số dư khuyến mãi (nếu có) đã giữ chỗ cho đơn này.
        </p>
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder="Ví dụ: Không thấy giao dịch khớp nội dung và số tiền trên sao kê trong 24h qua"
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
