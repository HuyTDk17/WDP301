import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, Inbox, Clock, Check, X, Wallet } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Badge from '@/components/ui/Badge/Badge'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import NetworkMembershipCard from '@/components/owner/NetworkMembershipCard/NetworkMembershipCard'
import { transferService, TRANSFER_STATUS, TRANSFER_TYPE_LABEL } from '@/services/transferService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, formatTime } from '@/utils'
import ListFilterBar from '@/components/dashboard/ListFilterBar/ListFilterBar'
import useListFilters from '@/hooks/useListFilters'
import styles from './TransferRequests.module.css'

const TABS = [
  { value: 'reschedule', label: 'Đổi lịch' },
  { value: 'incoming', label: 'Chuyển đến' },
  { value: 'outgoing', label: 'Chuyển đi' },
]

/**
 * Trang cho chủ sân xử lý yêu cầu chuyển sân.
 *   - "Đổi lịch": khách đổi giờ / đổi sân ngay tại địa điểm của mình. Cần chấp thuận/từ chối khi địa điểm bật duyệt
 *     (cài đặt ở mục Địa điểm); không thì được chấp nhận tự động và hiện ở đây để bạn theo dõi.
 *   - "Chuyển đến": yêu cầu khách muốn chuyển VÀO địa điểm của mình. Nếu địa
 *     điểm bật chế độ duyệt thủ công thì cần bấm chấp thuận/từ chối.
 *   - "Chuyển đi": lượt đặt tại địa điểm của mình đã bị khách chuyển đi nơi
 *     khác. Hiển thị rõ khoản bồi thường để chủ sân hiểu vì sao công nợ đổi.
 */
export default function TransferRequests() {
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  // ?tab=reschedule mở thẳng tab Đổi lịch (link trong thông báo "Khách xin đổi lịch")
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'reschedule'
  const setTab = (value) => setParams({ tab: value })
  const [data, setData] = useState({ incoming: [], outgoing: [], reschedules: [], pendingCount: 0, pendingRescheduleCount: 0 })
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    transferService.getOwnerTransfers()
      .then(setData)
      .catch(() => toast.error('Không thể tải danh sách yêu cầu chuyển sân'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleApprove = async (transfer) => {
    setActing(transfer._id)
    try {
      await transferService.approve(transfer._id)
      toast.success(transfer.type === 'T1' || transfer.type === 'T2' ? 'Đã chấp thuận yêu cầu đổi lịch' : 'Đã chấp thuận yêu cầu chuyển sân')
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

  const isRescheduleTab = tab === 'reschedule'
  const list = isRescheduleTab ? (data.reschedules || []) : tab === 'incoming' ? data.incoming : data.outgoing
  const pendingByTab = { reschedule: data.pendingRescheduleCount, incoming: data.pendingCount }
  const f = useListFilters(list, {
    searchText: (t) => `${t.customerId?.name || ''} ${t.customerId?.phone || ''} ${t.fromVenueName || ''} ${t.fromCourtName || ''} ${t.toVenueName || ''} ${t.toCourtName || ''}`,
    filters: { status: (t, v) => t.status === v, type: (t, v) => t.type === v },
    dateField: (t) => t.fromDate,
  })
  // Đổi tab thì bỏ bộ lọc cũ (trạng thái/loại ở tab này có thể không tồn tại ở tab kia)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { f.clear() }, [tab])
  const statusOptions = [...new Set(list.map((t) => t.status))].map((v) => ({ value: v, label: TRANSFER_STATUS[v]?.label || v }))
  const typeOptions = [...new Set(list.map((t) => t.type))].map((v) => ({ value: v, label: TRANSFER_TYPE_LABEL[v] || v }))

  return (
    <div className={styles.page}>
      <PageHeader
        title="Yêu cầu chuyển sân"
        subtitle={data.pendingCount > 0
          ? `Có ${data.pendingCount} yêu cầu đang chờ bạn phản hồi`
          : 'Theo dõi các lượt đặt được chuyển đến và chuyển đi khỏi địa điểm của bạn'}
      />

      <NetworkMembershipCard />

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.value}
            className={`${styles.tab} ${tab === t.value ? styles.tabActive : ''}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
            {pendingByTab[t.value] > 0 && (
              <span className={styles.tabBadge}>{pendingByTab[t.value]}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loading}><Spinner size="lg" /></div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Inbox size={48} />}
          title="Chưa có yêu cầu nào"
          description={isRescheduleTab
            ? 'Khi khách đổi giờ hoặc đổi sân tại địa điểm của bạn, yêu cầu sẽ hiện ở đây.'
            : tab === 'incoming'
              ? 'Khi khách muốn chuyển lượt đặt sang địa điểm của bạn, yêu cầu sẽ hiện ở đây.'
              : 'Chưa có lượt đặt nào tại địa điểm của bạn bị chuyển đi nơi khác.'}
        />
      ) : (
        <>
        <ListFilterBar f={f} placeholder="Tìm theo tên/SĐT khách, địa điểm, sân..." dateLabel="Ngày chơi" total={list.length}
          filters={[
            { key: 'status', placeholder: 'Mọi trạng thái', options: statusOptions },
            ...(isRescheduleTab ? [] : [{ key: 'type', placeholder: 'Mọi loại chuyển', options: typeOptions }]),
          ]} />
        {f.filtered.length === 0 ? <EmptyState icon={<Inbox size={48} />} title="Không có yêu cầu phù hợp" description="Thử bỏ bớt từ khóa hoặc bộ lọc." /> : (
        <div className={styles.list}>
          {f.filtered.map((t) => {
            const status = TRANSFER_STATUS[t.status] || TRANSFER_STATUS.quoted
            const needAction = (tab === 'incoming' || isRescheduleTab) && t.status === 'awaiting_owner_approval'

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
                    <span className={styles.routeTag}>{isRescheduleTab ? 'Lịch hiện tại' : 'Từ'}</span>
                    <p>{t.fromVenueName} – {t.fromCourtName}</p>
                    <p className={styles.routeTime}>{formatDate(t.fromDate)} · {formatTime(t.fromStartTime)}–{formatTime(t.fromEndTime)}</p>
                  </div>
                  <ArrowRight size={16} className={styles.arrow} />
                  <div className={styles.routeSide}>
                    <span className={`${styles.routeTag} ${styles.routeTagTo}`}>{isRescheduleTab ? 'Lịch mới' : 'Đến'}</span>
                    <p>{t.toVenueName} – {t.toCourtName}</p>
                    <p className={styles.routeTime}>{formatDate(t.toDate)} · {formatTime(t.toStartTime)}–{formatTime(t.toEndTime)}</p>
                  </div>
                </div>

                <div className={styles.money}>
                  {isRescheduleTab ? (
                    <span className={t.quote?.transferFee > 0 ? styles.moneyIn : styles.moneyMuted}>
                      <Wallet size={13} /> Phí đổi lịch bạn nhận: <strong>{formatCurrency(t.quote?.transferFee || 0)}</strong>
                      {!t.quote?.transferFee && ' (miễn phí do đổi sớm)'}
                    </span>
                  ) : tab === 'incoming' ? (
                    <span className={styles.moneyIn}>
                      <Wallet size={13} /> Bạn nhận: <strong>{formatCurrency(t.quote?.newAmount || 0)}</strong>
                    </span>
                  ) : (
                    <span className={t.quote?.compensation > 0 ? styles.moneyIn : styles.moneyMuted}>
                      <Wallet size={13} /> Bồi thường bạn nhận: <strong>{formatCurrency(t.quote?.compensation || 0)}</strong>
                      {t.quote?.compensation === 0 && ' (chuyển sớm nên không phát sinh)'}
                    </span>
                  )}
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
        title={isRescheduleTab ? 'Từ chối yêu cầu đổi lịch' : 'Từ chối yêu cầu chuyển sân'}
        description={isRescheduleTab
          ? 'Khách sẽ giữ nguyên lịch đặt hiện tại và được hoàn lại khoản đã thanh toán thêm (nếu có). Vui lòng nêu lý do để khách hiểu.'
          : 'Khách sẽ được hoàn lại toàn bộ khoản đã thanh toán thêm và lượt đặt ban đầu của họ vẫn giữ nguyên. Vui lòng nêu lý do để khách hiểu.'}
        reasonPlaceholder="VD: Khung giờ này đã có giải đấu nội bộ..."
        confirmLabel="Từ chối yêu cầu"
      />
    </div>
  )
}
