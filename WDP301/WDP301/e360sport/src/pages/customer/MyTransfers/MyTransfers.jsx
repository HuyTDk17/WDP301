import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Repeat } from 'lucide-react'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { transferService, TRANSFER_STATUS, TRANSFER_TYPE_LABEL } from '@/services/transferService'
import { formatCurrency, formatDate, formatTime } from '@/utils'
import styles from '../TransferDetail/TransferDetail.module.css'

/**
 * Danh sách yêu cầu đổi lịch / chuyển sân của khách — để theo dõi trạng thái (chờ duyệt, đã duyệt/hoàn tất,
 * bị từ chối, hết hạn). Bấm một dòng để xem chi tiết (/transfers/:id).
 */
export default function MyTransfers() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    transferService.getMine()
      .then((res) => setItems(res.transfers || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className={styles.page}>
      <div className="container">
        <Link to="/bookings" className={styles.back}><ArrowLeft size={15} /> Quay lại lịch sử đặt sân</Link>
        <h1 style={{ margin: '12px 0 4px' }}>Yêu cầu đổi lịch / chuyển sân</h1>
        <p style={{ color: 'var(--text-muted, #64748b)', marginBottom: 16 }}>Theo dõi trạng thái các yêu cầu bạn đã gửi.</p>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner size="lg" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Repeat size={48} />} title="Chưa có yêu cầu nào" description="Khi bạn đổi lịch hoặc chuyển sân, yêu cầu sẽ hiện ở đây." />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((t) => {
              const st = TRANSFER_STATUS[t.status] || { label: t.status, color: '#64748b', bg: '#F1F5F9' }
              return (
                <Link key={t._id} to={`/transfers/${t._id}`} style={{ display: 'block', padding: 14, border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, background: 'var(--bg-surface, #fff)', color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong>{TRANSFER_TYPE_LABEL[t.type] || 'Chuyển sân'}</strong>
                    <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 14 }}>
                    {t.fromVenueName} · {formatDate(t.fromDate)} {formatTime(t.fromStartTime)}–{formatTime(t.fromEndTime)}
                    {' '}<ArrowRight size={13} style={{ verticalAlign: 'middle' }} />{' '}
                    {t.toVenueName} · {formatDate(t.toDate)} {formatTime(t.toStartTime)}–{formatTime(t.toEndTime)}
                  </p>
                  {t.quote?.settlement > 0 && <p style={{ margin: '4px 0 0', fontSize: 13 }}>Cần thanh toán thêm: {formatCurrency(t.quote.settlement)}</p>}
                  {t.status === 'rejected' && t.rejectionReason && <p style={{ margin: '4px 0 0', fontSize: 13 }}>Lý do từ chối: {t.rejectionReason}</p>}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
