import { useState, useEffect, useCallback } from 'react'
import { Network } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import { networkService, NETWORK_STATUS_LABEL } from '@/services/networkService'
import { useToast } from '@/contexts/ToastContext'
import { formatDate } from '@/utils'
import styles from './NetworkMembershipCard.module.css'

const COPY = {
  none: 'Tham gia mạng lưới để khách có thể chuyển lượt đặt giữa địa điểm của bạn và các chủ sân khác.',
  pending: 'Yêu cầu của bạn đang chờ quản trị viên duyệt. Bạn sẽ nhận thông báo khi có kết quả.',
  approved: 'Bạn là thành viên: khách có thể chuyển lượt đặt từ/đến địa điểm của bạn với các chủ sân khác trong mạng lưới.',
  rejected: 'Yêu cầu trước của bạn chưa được duyệt. Bạn có thể cải thiện và gửi lại.',
  revoked: 'Tư cách thành viên của bạn đã bị gỡ. Vui lòng liên hệ quản trị viên để được xem xét lại.',
}

/** Trạng thái thành viên mạng lưới chuyển sân của chủ sân + nút xin tham gia. */
export default function NetworkMembershipCard() {
  const { toast } = useToast()
  const [info, setInfo] = useState(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(() => {
    networkService.getMine().then(setInfo).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  if (!info) return null

  const request = async () => {
    setSending(true)
    try {
      await networkService.requestToJoin()
      toast.success('Đã gửi yêu cầu tham gia mạng lưới')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi yêu cầu')
      load()
    } finally {
      setSending(false)
    }
  }

  const respond = async (accept) => {
    setSending(true)
    try {
      await networkService.respondToInvite(accept)
      toast.success(accept ? 'Bạn đã trở thành thành viên mạng lưới chuyển sân' : 'Đã từ chối lời mời tham gia')
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi phản hồi')
    } finally {
      setSending(false)
      load()
    }
  }

  // Admin đã mời và chủ sân chưa trả lời → hỏi "tham gia hay không" thay cho nút xin tham gia
  const invited = info.status === 'none' && !!info.invitedAt
  const canRequest = !invited && ['none', 'rejected'].includes(info.status)

  return (
    <div className={`${styles.card} ${info.status === 'approved' ? styles.ok : ''}`}>
      <div className={styles.icon}><Network size={20} /></div>
      <div className={styles.body}>
        <p className={styles.title}>
          Mạng lưới chuyển sân
          <span className={`${styles.badge} ${styles[info.status]}`}>{NETWORK_STATUS_LABEL[info.status]}</span>
        </p>
        <p className={styles.text}>{invited ? 'Quản trị viên mời bạn tham gia mạng lưới chuyển sân: khách có thể chuyển lượt đặt giữa địa điểm của bạn và các chủ sân khác. Bạn có muốn tham gia không?' : COPY[info.status]}</p>
        {info.note && ['rejected', 'revoked'].includes(info.status) && <p className={styles.note}>Lý do: {info.note}</p>}
        {!info.required && <p className={styles.hint}>Hiện quản trị viên chưa bật chế độ duyệt: mọi chủ sân đều đang tự động tham gia. Xin tham gia trước giúp bạn không bị gián đoạn khi chế độ này được bật.</p>}
        {invited && <p className={styles.hint}>Lời mời gửi ngày {formatDate(info.invitedAt)}</p>}
        {info.status === 'pending' && info.requestedAt && <p className={styles.hint}>Gửi ngày {formatDate(info.requestedAt)}</p>}
      </div>
      {invited && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Button size="sm" variant="outline" onClick={() => respond(false)} disabled={sending}>Không tham gia</Button>
          <Button size="sm" onClick={() => respond(true)} loading={sending}>Tham gia</Button>
        </div>
      )}
      {canRequest && <Button size="sm" onClick={request} loading={sending}>{info.status === 'rejected' ? 'Gửi lại yêu cầu' : 'Xin tham gia'}</Button>}
    </div>
  )
}
