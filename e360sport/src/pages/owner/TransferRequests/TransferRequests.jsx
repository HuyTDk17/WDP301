import { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Inbox, Clock, Check, X, Wallet } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Badge from '@/components/ui/Badge/Badge'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import { transferService, TRANSFER_STATUS, TRANSFER_TYPE_LABEL } from '@/services/transferService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, formatTime } from '@/utils'
import ListFilterBar from '@/components/dashboard/ListFilterBar/ListFilterBar'
import useListFilters from '@/hooks/useListFilters'
import styles from './TransferRequests.module.css'

/**
 * Trang cho chủ sân xử lý yêu cầu ĐỔI LỊCH: khách đổi giờ / đổi sân ngay tại địa điểm của mình.
 * Cần chấp thuận/từ chối khi địa điểm bật duyệt (cài đặt ở mục Địa điểm); không thì được chấp nhận tự động
 * và hiện ở đây để bạn theo dõi.
 */
export default function TransferRequests() {
  const { toast } = useToast()
  const [data, setData] = useState({ reschedules: [], pendingRescheduleCount: 0 })
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    transferService.getOwnerTransfers()
      .then(setData)
      .catch(() => toast.error('Không thể tải danh sách yêu cầu đổi lịch'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleApprove = async (transfer) => {
    setActing(transfer._id)
    try {
      await transferService.approve(transfer._id)
      toast.success('Đã chấp thuận yêu cầu đổi lịch')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể chấp thuận yêu cầu')
    } finally {
      setActing(null)
    }
  }

  const handleReject = async (reason) => {
    try {
      await transferService.reject(rejectTarget._id, reason)
      toast.success('Đã từ chối yêu cầu. Khách sẽ được hoàn lại toàn bộ khoản đã thu thêm.')
      setRejectTarget(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể từ chối yêu cầu')
    }
  }

  const list = data.reschedules || []
  const f = useListFilters(list, {
    searchText: (t) => `${t.customerId?.name || ''} ${t.customerId?.phone || ''} ${t.fromVenueName || ''} ${t.fromCourtName || ''} ${t.toVenueName || ''} ${t.toCourtName || ''}`,
    filters: { status: (t, v) => t.status === v, type: (t, v) => t.type === v },
    dateField: (t) => t.fromDate,
  })
  const statusOptions = [...new Set(list.map((t) => t.status))].map((v) => ({ value: v, label: TRANSFER_STATUS[v]?.label || v }))
  const typeOptions = [...new Set(list.map((t) => t.type))].map((v) => ({ value: v, label: TRANSFER_TYPE_LABEL[v] || v }))

  return (
    <div className={styles.page}>
      <PageHeader
        title="Yêu cầu đổi lịch"
        subtitle={data.pendingRescheduleCount > 0
          ? `Có ${data.pendingRescheduleCount} yêu cầu đang chờ bạn phản hồi`
          : 'Theo dõi các lượt đặt được khách đổi giờ hoặc đổi sân tại địa điểm của bạn'}
      />

      {loading ? (
        <div className={styles.loading}><Spinner size="lg" /></div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Inbox size={48} />}
          title="Chưa có yêu cầu nào"
          description="Khi khách đổi giờ hoặc đổi sân tại địa điểm của bạn, yêu cầu sẽ hiện ở đây."
        />
      ) : (
        <>
        <ListFilterBar f={f} placeholder="Tìm theo tên/SĐT khách, địa điểm, sân..." dateLabel="Ngày chơi" total={list.length}
          filters={[
            { key: 'status', placeholder: 'Mọi trạng thái', options: statusOptions },
            { key: 'type', placeholder: 'Mọi loại đổi lịch', options: typeOptions },
          ]} />
        {f.filtered.length === 0 ? <EmptyState icon={<Inbox size={48} />} title="Không có yêu cầu phù hợp" description="Thử bỏ bớt từ khóa hoặc bộ lọc." /> : (
        <div className={styles.list}>
          {f.filtered.map((t) => {
            const status = TRANSFER_STATUS[t.status] || TRANSFER_STATUS.quoted
            const needAction = t.status === 'awaiting_owner_approval'

            return (
              <div key={t._id} className={`${styles.item} ${needAction ? styles.itemPending : ''}`}>
                <div className={styles.itemTop}>
                  <div>
                    <p className={styles.customer}>{t.customerId?.name || 'Khách hàng'}</p>
                    <p className={styles.typeLabel}>{TRANSFER_TYPE_LABEL[t.type]}</p>
                  </div>
                  <Badge size="sm" style={{ background: status.bg, color: status.color }}>{status.label}</Badge>
                </div>

                <div className={styles.route}>
                  <div className={styles.routeSide}>
                    <span className={styles.routeTag}>Lịch hiện tại</span>
                    <p>{t.fromVenueName} – {t.fromCourtName}</p>
                    <p className={styles.routeTime}>{formatDate(t.fromDate)} · {formatTime(t.fromStartTime)}–{formatTime(t.fromEndTime)}</p>
                  </div>
                  <ArrowRight size={16} className={styles.arrow} />
                  <div className={styles.routeSide}>
                    <span className={`${styles.routeTag} ${styles.routeTagTo}`}>Lịch mới</span>
                    <p>{t.toVenueName} – {t.toCourtName}</p>
                    <p className={styles.routeTime}>{formatDate(t.toDate)} · {formatTime(t.toStartTime)}–{formatTime(t.toEndTime)}</p>
                  </div>
                </div>

                <div className={styles.money}>
                  <span className={t.quote?.transferFee > 0 ? styles.moneyIn : styles.moneyMuted}>
                    <Wallet size={13} /> Phí đổi lịch bạn nhận: <strong>{formatCurrency(t.quote?.transferFee || 0)}</strong>
                    {!t.quote?.transferFee && ' (miễn phí do đổi sớm)'}
                  </span>
                </div>

                {needAction && (
                  <div className={styles.actions}>
                    <span className={styles.deadline}>
                      <Clock size={13} /> Hạn phản hồi: {new Date(t.quoteExpiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className={styles.actionBtns}>
                      <Button variant="outline" size="sm" icon={<X size={13} />} onClick={() => setRejectTarget(t)}>Từ chối</Button>
                      <Button size="sm" icon={<Check size={13} />} loading={acting === t._id} onClick={() => handleApprove(t)}>Chấp thuận</Button>
                    </div>
                  </div>
                )}

                {t.rejectionReason && <p className={styles.reason}>Lý do từ chối: {t.rejectionReason}</p>}
              </div>
            )
          })}
        </div>
        )}
        </>
      )}

      <ReasonModal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="Từ chối yêu cầu đổi lịch"
        description="Khách sẽ giữ nguyên lịch đặt hiện tại và được hoàn lại khoản đã thanh toán thêm (nếu có). Vui lòng nêu lý do để khách hiểu."
        reasonPlaceholder="VD: Khung giờ này đã có giải đấu nội bộ..."
        confirmLabel="Từ chối yêu cầu"
      />
    </div>
  )
}
