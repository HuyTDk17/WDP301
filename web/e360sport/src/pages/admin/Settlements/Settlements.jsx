import { useState, useEffect, useCallback } from 'react'
import { Check, X, Receipt, CircleCheck, FilePlus2 } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Modal from '@/components/ui/Modal/Modal'
import { settlementService, SETTLEMENT_STATUS } from '@/services/settlementService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/utils'
import styles from './Settlements.module.css'

const TABS = [
  { key: 'reported', label: 'Chờ đối chiếu' },
  { key: 'issued', label: 'Chờ chủ sân nộp / chờ chuyển' },
  { key: 'balances', label: 'Số dư các chủ sân' },
  { key: 'paid', label: 'Đã thanh toán' },
]

/**
 * Đối soát hoa hồng với chủ sân.
 *
 * Khách chuyển tiền đặt sân thẳng cho chủ sân nên nền tảng thu hoa hồng bằng HOÁ ĐƠN:
 *   • owner_pays    — chủ sân nộp hoa hồng: đối chiếu sao kê rồi bấm Xác nhận (hoặc Từ chối).
 *   • platform_pays — nền tảng nợ chủ sân (khách dùng số dư/điểm/khuyến mãi): bạn chuyển
 *                     khoản cho chủ sân rồi bấm "Đã chuyển".
 * Quản trị viên chỉ làm việc với chủ sân ở đây — không dính vào đặt sân giữa khách và chủ sân.
 */
export default function Settlements() {
  const { toast } = useToast()
  const [tab, setTab] = useState('reported')
  const [items, setItems] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const req = tab === 'balances'
      ? settlementService.getBalances().then((r) => setBalances(r.owners || []))
      : settlementService.list(tab).then((r) => setItems(r.settlements || []))
    req.catch(() => toast.error('Không thể tải dữ liệu đối soát')).finally(() => setLoading(false))
  }, [tab])
  useEffect(() => { load() }, [load])

  const run = async (id, fn, okMsg) => {
    setActing(id)
    try { await fn(); toast.success(okMsg); load() }
    catch (err) { toast.error(err?.message || 'Thao tác thất bại') }
    finally { setActing(null) }
  }

  const issue = (row) => run(row.ownerId, () => settlementService.issueForOwner(row.ownerId), 'Đã lập hoá đơn và thông báo cho chủ sân')

  const doReject = async () => {
    await run(rejecting._id, () => settlementService.reject(rejecting._id, reason), 'Đã từ chối — chủ sân sẽ được báo')
    setRejecting(null); setReason('')
  }

  const ownerName = (s) => s.ownerId?.businessName || s.ownerId?.name || 'Chủ sân'

  return (
    <div className={styles.page}>
      <PageHeader title="Đối soát hoa hồng" subtitle="Hoa hồng nền tảng thu từ chủ sân theo hoá đơn — khách chuyển tiền thẳng cho chủ sân" />

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loading}><Spinner size="lg" /></div>
      ) : tab === 'balances' ? (
        balances.length === 0 ? (
          <EmptyState icon={<CircleCheck size={48} />} title="Chưa có chủ sân nào" description="Chưa có dữ liệu số dư." />
        ) : (
          <div className={styles.list}>
            {balances.map((b) => (
              <div key={b.ownerId} className={styles.item}>
                <div className={styles.info}>
                  <div className={styles.topRow}>
                    <strong>{b.name}</strong>
                    {b.openSettlement && (
                      <Badge size="sm" style={{ background: SETTLEMENT_STATUS[b.openSettlement.status].bg, color: SETTLEMENT_STATUS[b.openSettlement.status].color }}>
                        Hoá đơn {b.openSettlement.code}: {SETTLEMENT_STATUS[b.openSettlement.status].label}
                      </Badge>
                    )}
                  </div>
                  <p className={styles.meta}>
                    Đang giữ {formatCurrency(b.cashHeld)} · được hưởng {formatCurrency(b.entitlement)} · {b.bookingCount} lượt đặt
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <div className={styles.num}>
                    <p className={b.balance > 0 ? styles.owe : b.balance < 0 ? styles.receive : ''}>{formatCurrency(Math.abs(b.balance))}</p>
                    <p className={styles.meta}>{b.balance > 0 ? 'chủ sân cần nộp hoa hồng' : b.balance < 0 ? 'nền tảng cần chuyển lại chủ sân' : 'đã cân bằng'}</p>
                  </div>
                  <Button size="sm" variant="outline" icon={<FilePlus2 size={13} />} loading={acting === b.ownerId}
                    disabled={!!b.openSettlement || Math.abs(b.balance) < 1000} onClick={() => issue(b)}>
                    Lập hoá đơn
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState icon={<Receipt size={48} />} title="Không có hoá đơn nào" description="Chưa có hoá đơn ở trạng thái này." />
      ) : (
        <div className={styles.list}>
          {items.map((s) => {
            const st = SETTLEMENT_STATUS[s.status]
            const ownerPays = s.direction === 'owner_pays'
            return (
              <div key={s._id} className={styles.item}>
                <div className={styles.info}>
                  <div className={styles.topRow}>
                    <span className={styles.amount}>{formatCurrency(s.amount)}</span>
                    <Badge size="sm" style={{ background: st.bg, color: st.color }}>{st.label}</Badge>
                    <Badge size="sm" style={{ background: '#F1F5F9', color: '#4A5568' }}>{ownerPays ? 'Chủ sân nộp nền tảng' : 'Nền tảng chuyển chủ sân'}</Badge>
                    {s.overdue && <Badge size="sm" style={{ background: '#FEE2E2', color: '#B91C1C' }}>Quá hạn</Badge>}
                  </div>
                  <p><strong>{ownerName(s)}</strong> · hoá đơn {s.code} · kỳ {s.period}</p>
                  <p className={styles.meta}>
                    {ownerPays
                      ? `Nội dung chuyển khoản cần khớp: ${s.code}`
                      : `Chuyển tới: ${s.payee?.bankName || ''} ${s.payee?.accountNumber || ''} · ${s.payee?.accountName || ''}`}
                    {' · '}hạn {new Date(s.dueDate).toLocaleDateString('vi-VN')}
                  </p>
                  {s.reportedNote && <p className={styles.meta}>Ghi chú của chủ sân: {s.reportedNote}</p>}
                  {s.rejectionNote && s.status === 'issued' && <p className={styles.meta}>Lần từ chối trước: {s.rejectionNote}</p>}
                </div>
                {['issued', 'reported'].includes(s.status) && (
                  <div className={styles.actions}>
                    {ownerPays && s.status === 'reported' && (
                      <Button variant="outline" size="sm" icon={<X size={13} />} onClick={() => setRejecting(s)}>Từ chối</Button>
                    )}
                    {!(ownerPays && s.status === 'issued') && (
                      <Button size="sm" icon={<Check size={13} />} loading={acting === s._id}
                        onClick={() => run(s._id, () => settlementService.confirm(s._id), ownerPays ? 'Đã xác nhận nhận hoa hồng' : 'Đã ghi nhận chuyển tiền cho chủ sân')}>
                        {ownerPays ? 'Đã nhận tiền — xác nhận' : 'Đã chuyển cho chủ sân'}
                      </Button>
                    )}
                    {ownerPays && s.status === 'issued' && (
                      <Button size="sm" variant="outline" icon={<Check size={13} />} loading={acting === s._id}
                        onClick={() => run(s._id, () => settlementService.confirm(s._id), 'Đã xác nhận nhận hoa hồng')}>
                        Xác nhận (chủ sân chưa báo)
                      </Button>
                    )}
                    <Button variant="outline" size="sm" loading={acting === s._id}
                      onClick={() => run(s._id, () => settlementService.cancel(s._id), 'Đã huỷ hoá đơn')}>Huỷ hoá đơn</Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!rejecting} onClose={() => setRejecting(null)} title="Từ chối khoản chủ sân báo đã nộp">
        <p className={styles.sub}>Không thấy khoản chuyển khớp trên sao kê? Ghi rõ lý do — hoá đơn trở về "chờ thanh toán" và chủ sân sẽ được thông báo.</p>
        <textarea className={styles.textarea} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: Chưa thấy giao dịch khớp nội dung và số tiền" />
        <div className={styles.modalActions}>
          <Button variant="outline" onClick={() => setRejecting(null)}>Huỷ</Button>
          <Button onClick={doReject} loading={acting === rejecting?._id}>Xác nhận từ chối</Button>
        </div>
      </Modal>
    </div>
  )
}
