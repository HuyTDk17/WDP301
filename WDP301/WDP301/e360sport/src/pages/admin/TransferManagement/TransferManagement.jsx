import { useState, useEffect, useCallback } from 'react'
import { Repeat, TrendingUp, Wallet, CheckCircle2, Wrench } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatCard from '@/components/dashboard/StatCard/StatCard'
import Badge from '@/components/ui/Badge/Badge'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import ReasonModal from '@/components/dashboard/ReasonModal/ReasonModal'
import { transferService, TRANSFER_STATUS, TRANSFER_TYPE_LABEL } from '@/services/transferService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, formatTime } from '@/utils'
import styles from './TransferManagement.module.css'

const FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'awaiting_owner_approval', label: 'Chờ duyệt' },
  { value: 'failed', label: 'Thất bại' },
  { value: 'rejected', label: 'Bị từ chối' },
]

/**
 * Trang quản trị nghiệp vụ chuyển sân: theo dõi hiệu quả chức năng và can
 * thiệp vào các yêu cầu bị kẹt.
 */
export default function TransferManagement() {
  const { toast } = useToast()
  const [status, setStatus] = useState('')
  const [data, setData] = useState({ transfers: [], total: 0 })
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [resolveTarget, setResolveTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      transferService.getAllTransfers(status ? { status } : {}),
      transferService.getReport(),
    ])
      .then(([list, rep]) => { setData(list); setReport(rep) })
      .catch(() => toast.error('Không thể tải dữ liệu chuyển sân'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => { load() }, [load])

  const handleResolve = async (reason) => {
    try {
      await transferService.forceResolve(resolveTarget._id, reason)
      toast.success('Đã xử lý. Khách được hoàn tiền và lượt đặt gốc giữ nguyên.')
      setResolveTarget(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể xử lý yêu cầu')
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Chuyển sân"
        subtitle="Theo dõi hiệu quả chức năng chuyển sân và xử lý các yêu cầu bị kẹt"
      />

      {report && (
        <div className={styles.stats}>
          <StatCard icon={<Repeat size={18} />} label="Tổng yêu cầu" value={report.totalRequests} />
          <StatCard icon={<CheckCircle2 size={18} />} label="Tỉ lệ thành công" value={`${report.successRate}%`} />
          <StatCard icon={<TrendingUp size={18} />} label="Doanh thu phí chuyển" value={formatCurrency(report.totals?.transfer_fee || 0)} />
          <StatCard icon={<Wallet size={18} />} label="Bồi thường đã chi" value={formatCurrency(report.totals?.owner_compensation || 0)} />
        </div>
      )}

      {report?.byType?.length > 0 && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Phân bố theo loại chuyển (chỉ tính yêu cầu hoàn tất)</h3>
          <div className={styles.typeTable}>
            <div className={styles.typeHead}>
              <span>Loại</span><span>Số lượt</span><span>Phí thu được</span><span>Bồi thường đã chi</span>
            </div>
            {report.byType.map((t) => (
              <div key={t._id} className={styles.typeRow}>
                <span>{TRANSFER_TYPE_LABEL[t._id] || t._id}</span>
                <span>{t.count}</span>
                <span>{formatCurrency(t.fee || 0)}</span>
                <span>{formatCurrency(t.compensation || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`${styles.filter} ${status === f.value ? styles.filterActive : ''}`}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loading}><Spinner size="lg" /></div>
      ) : data.transfers.length === 0 ? (
        <EmptyState icon={<Repeat size={48} />} title="Chưa có yêu cầu chuyển sân nào" description="Danh sách sẽ hiện khi khách hàng bắt đầu sử dụng chức năng này." />
      ) : (
        <div className={styles.card}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Khách hàng</th><th>Loại</th><th>Từ</th><th>Đến</th>
                  <th>Phí</th><th>Bồi thường</th><th>Quyết toán</th><th>Trạng thái</th><th />
                </tr>
              </thead>
              <tbody>
                {data.transfers.map((t) => {
                  const st = TRANSFER_STATUS[t.status] || TRANSFER_STATUS.quoted
                  const stuck = ['processing', 'failed'].includes(t.status)
                  return (
                    <tr key={t._id}>
                      <td>
                        <p className={styles.strong}>{t.customerId?.name || 'Khách hàng'}</p>
                        <p className={styles.muted}>{t.customerId?.email || ''}</p>
                      </td>
                      <td className={styles.muted}>{TRANSFER_TYPE_LABEL[t.type]}</td>
                      <td>
                        <p>{t.fromVenueName}</p>
                        <p className={styles.muted}>{formatDate(t.fromDate)} · {formatTime(t.fromStartTime)}</p>
                      </td>
                      <td>
                        <p>{t.toVenueName}</p>
                        <p className={styles.muted}>{formatDate(t.toDate)} · {formatTime(t.toStartTime)}</p>
                      </td>
                      <td>{formatCurrency(t.quote?.transferFee || 0)}</td>
                      <td>{formatCurrency(t.quote?.compensation || 0)}</td>
                      <td className={(t.quote?.settlement || 0) < 0 ? styles.negative : ''}>
                        {(t.quote?.settlement || 0) < 0
                          ? `− ${formatCurrency(-(t.quote?.settlement || 0))}`
                          : formatCurrency(t.quote?.settlement || 0)}
                      </td>
                      <td><Badge size="sm" style={{ background: st.bg, color: st.color }}>{st.label}</Badge></td>
                      <td>
                        {stuck && (
                          <Button variant="outline" size="sm" icon={<Wrench size={13} />} onClick={() => setResolveTarget(t)}>
                            Xử lý
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ReasonModal
        isOpen={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        onConfirm={handleResolve}
        title="Xử lý thủ công yêu cầu chuyển sân"
        description="Hệ thống sẽ đóng yêu cầu này, hoàn 100% khoản khách đã thanh toán thêm và giữ nguyên lượt đặt gốc. Thao tác không áp dụng cho yêu cầu đã hoàn tất."
        reasonPlaceholder="VD: Lỗi kỹ thuật khi thực thi, khách đã liên hệ tổng đài..."
        confirmLabel="Xử lý và hoàn tiền"
      />
    </div>
  )
}
