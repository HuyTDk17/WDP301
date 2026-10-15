import { useState, useEffect, useCallback } from 'react'
import { Percent, Copy, Check, AlertTriangle, Hourglass, Info, ShieldAlert } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import { settlementService, SETTLEMENT_STATUS } from '@/services/settlementService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/utils'
import styles from './Commission.module.css'

function CopyRow({ label, value, copyValue }) {
  const [done, setDone] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(String(copyValue ?? value)).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {})
  }
  return (
    <div className={styles.copyRow}>
      <span>{label}</span>
      <strong>
        {value}
        <button type="button" className={styles.copyBtn} onClick={copy} aria-label={`Sao chép ${label}`}>
          {done ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </strong>
    </div>
  )
}

/**
 * Trang NỘP PHÍ DỊCH VỤ nền tảng của chủ sân.
 *
 * Khách chuyển tiền đặt sân thẳng vào tài khoản của bạn nên nền tảng không thể tự trừ phí.
 * Hệ thống tính phí của từng đơn (xem ở trang Doanh thu), lập hoá đơn vào ngày 1 hằng tháng
 * kèm mã QR. Khi tiền về tài khoản nền tảng, hệ thống TỰ XÁC NHẬN (nếu đã bật) và hoá đơn
 * chuyển sang "Đã thanh toán"; nếu chưa bật thì bấm "Tôi đã chuyển khoản" để quản trị viên xác nhận.
 * Quá hạn + ân hạn mà chưa nộp thì địa điểm bị khoá (không hiển thị, không nhận đặt mới).
 */
export default function Commission() {
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [reporting, setReporting] = useState(false)

  const load = useCallback(() => {
    settlementService.getMyCommission()
      .then(setData)
      .catch(() => toast.error('Không thể tải thông tin phí dịch vụ'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  // Hoá đơn đang chờ tiền: hỏi lại máy chủ mỗi 20 giây để trang tự cập nhật khi hệ thống đã nhận tiền
  const waiting = data?.open?.direction === 'owner_pays' && ['issued', 'reported'].includes(data?.open?.status)
  useEffect(() => {
    if (!waiting) return undefined
    const timer = setInterval(load, 20000)
    return () => clearInterval(timer)
  }, [waiting, load])

  const handleReport = async () => {
    setReporting(true)
    try {
      await settlementService.reportPaid(data.open._id, note)
      toast.success('Đã ghi nhận — quản trị viên sẽ đối chiếu và xác nhận sớm')
      setNote('')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi báo cáo')
    } finally {
      setReporting(false)
    }
  }

  if (loading) return <div className={styles.loading}><Spinner size="lg" /></div>
  if (!data) return null

  const { balance, open, history, blocked } = data
  const owes = balance.balance > 0
  const platformOwes = balance.balance < 0

  return (
    <div className={styles.page}>
      <PageHeader
        title="Phí dịch vụ nền tảng"
        subtitle="Khách chuyển tiền thẳng vào tài khoản của bạn — phí dịch vụ được tính theo từng đơn và nộp theo hoá đơn hằng tháng"
      />

      {blocked && (
        <div className={`${styles.alert} ${styles.alertDanger}`}>
          <ShieldAlert size={18} />
          <span>
            <strong>Địa điểm của bạn đang tạm ngưng nhận đặt mới</strong> vì hoá đơn phí dịch vụ đã quá hạn.
            Các lượt đặt hiện có vẫn giữ nguyên. Thanh toán hoá đơn bên dưới và báo chuyển khoản để mở lại ngay khi quản trị viên xác nhận.
          </span>
        </div>
      )}

      {/* ── Số dư hiện tại ── */}
      <div className={styles.card}>
        <div className={styles.hero}>
          <div>
            <p className={styles.sub}>Phí dịch vụ cần nộp cho nền tảng (đến hiện tại)</p>
            <p className={`${styles.bigAmount} ${owes ? styles.owe : ''} `}>
              {formatCurrency(Math.max(0, balance.balance))}
            </p>
          </div>
          <Percent size={32} style={{ color: 'var(--text-muted)' }} />
        </div>
        <div className={styles.rows}>
          <div className={styles.row}><span>Tiền khách đã chuyển vào tài khoản của bạn</span><strong>{formatCurrency(balance.cashHeld)}</strong></div>
          {balance.refundsByOwner > 0 && <div className={styles.row}><span>Tiền bạn đã/đang phải hoàn lại cho khách</span><strong>−{formatCurrency(balance.refundsByOwner)}</strong></div>}
          <div className={styles.row}><span>Doanh thu của bạn (giá sân đã trừ phí dịch vụ bạn chịu)</span><strong>−{formatCurrency(balance.entitlement)}</strong></div>
          {balance.remitted > 0 && <div className={styles.row}><span>Đã nộp cho nền tảng</span><strong>−{formatCurrency(balance.remitted)}</strong></div>}
          {balance.platformPaid > 0 && <div className={styles.row}><span>Điều chỉnh đối soát đã thực hiện</span><strong>+{formatCurrency(balance.platformPaid)}</strong></div>}
          <div className={`${styles.row} ${styles.rowTotal}`}>
            <span>Phí dịch vụ cần nộp</span><strong>{formatCurrency(Math.max(0, balance.balance))}</strong>
          </div>
        </div>
        {platformOwes && (
          <div className={`${styles.alert} ${styles.alertInfo}`}>
            <Info size={16} />
            <span>Hiện chưa có phí dịch vụ cần nộp. Phần chênh lệch (ví dụ khách thanh toán bằng số dư tín dụng nên không chuyển tiền vào tài khoản của bạn) sẽ được đối soát qua hoá đơn riêng.</span>
          </div>
        )}
      </div>

      {/* ── Hoá đơn đang mở ── */}
      {open ? (
        <div className={styles.card}>
          <div className={styles.hero}>
            <h3 className={styles.cardTitle}>Hoá đơn {open.code}</h3>
            <Badge size="sm" style={{ background: SETTLEMENT_STATUS[open.status].bg, color: SETTLEMENT_STATUS[open.status].color }}>
              {SETTLEMENT_STATUS[open.status].label}
            </Badge>
          </div>

          {open.direction === 'owner_pays' ? (
            <>
              <p className={styles.sub}>
                Số tiền cần nộp: <strong>{formatCurrency(open.amount)}</strong> · hạn {new Date(open.dueDate).toLocaleDateString('vi-VN')}
                {open.overdue && <> — <strong style={{ color: '#B91C1C' }}>đã quá hạn</strong></>}
              </p>

              {open.status === 'issued' && (
                <div className={`${styles.alert} ${data.blocked || open.overdue ? styles.alertDanger : styles.alertWarn}`}>
                  <ShieldAlert size={16} />
                  <span>
                    {data.blocked
                      ? <>Địa điểm của bạn đang bị <strong>khoá</strong>: không hiển thị trên hệ thống và không nhận đặt mới (đơn đã đặt vẫn giữ nguyên). Thanh toán hoá đơn này để mở lại.</>
                      : <>Hạn nộp <strong>{new Date(open.dueDate).toLocaleDateString('vi-VN')}</strong>.
                        {open.lockDate && <> Nếu đến hết <strong>{new Date(open.lockDate).toLocaleDateString('vi-VN')}</strong> vẫn chưa thanh toán, địa điểm của bạn sẽ bị <strong>khoá</strong> và không còn hiển thị trên hệ thống.</>}</>}
                  </span>
                </div>
              )}

              {open.status === 'issued' && open.rejectionNote && (
                <div className={`${styles.alert} ${styles.alertWarn}`}>
                  <AlertTriangle size={16} /><span>Lần báo trước chưa được xác nhận: {open.rejectionNote}</span>
                </div>
              )}

              {open.status === 'issued' && open.payInfo && (
                <>
                  <div className={styles.payBox}>
                    {open.payInfo.qrUrl && <img className={styles.qr} src={open.payInfo.qrUrl} alt="Mã QR chuyển khoản phí dịch vụ" />}
                    <div>
                      <CopyRow label="Ngân hàng" value={open.payInfo.bankName || '—'} />
                      <CopyRow label="Số tài khoản" value={open.payInfo.accountNumber} />
                      <CopyRow label="Chủ tài khoản" value={open.payInfo.accountName || '—'} />
                      <CopyRow label="Số tiền" value={formatCurrency(open.amount)} copyValue={open.amount} />
                      <CopyRow label="Nội dung" value={open.code} />
                    </div>
                  </div>
                  <div className={`${styles.alert} ${styles.alertWarn}`}>
                    <AlertTriangle size={16} />
                    <span>Chuyển <strong>đúng số tiền và đúng nội dung</strong>{data.policy?.autoConfirm ? ' để hệ thống tự động nhận diện.' : ' để quản trị viên đối chiếu.'} Chỉ chuyển một lần.</span>
                  </div>
                  {data.policy?.autoConfirm ? (
                    <div className={`${styles.alert} ${styles.alertInfo}`}>
                      <Hourglass size={16} />
                      <span>Sau khi chuyển, hệ thống <strong>tự xác nhận</strong> trong vài phút và trang này tự cập nhật — bạn không cần bấm gì thêm.</span>
                    </div>
                  ) : (
                    <>
                      <input className={styles.noteInput} placeholder="Ghi chú / mã giao dịch ngân hàng (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} />
                      <div className={styles.actions}>
                        <Button loading={reporting} onClick={handleReport}>Tôi đã chuyển khoản</Button>
                      </div>
                    </>
                  )}
                </>
              )}

              {open.status === 'reported' && (
                <div className={`${styles.alert} ${styles.alertInfo}`}>
                  <Hourglass size={16} />
                  <span>Bạn đã báo chuyển khoản{open.reportedAt ? ` lúc ${new Date(open.reportedAt).toLocaleString('vi-VN')}` : ''}. Quản trị viên đang đối chiếu — bạn <strong>không cần chuyển lại</strong>.</span>
                </div>
              )}
            </>
          ) : (
            <div className={`${styles.alert} ${styles.alertInfo}`}>
              <Info size={16} />
              <span>
                Nền tảng sẽ chuyển <strong>{formatCurrency(open.amount)}</strong> vào tài khoản {open.payee?.bankName} ·{' '}
                {open.payee?.accountNumber} của bạn. Bạn không cần làm gì thêm — hoá đơn tự đóng khi quản trị viên xác nhận đã chuyển.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Chưa có hoá đơn cần xử lý</h3>
          <p className={styles.sub}>Hoá đơn được lập tự động vào ngày 1 hằng tháng nếu có phí dịch vụ phải nộp. Khi có, mã QR chuyển khoản sẽ hiện ở đây, kèm thông báo nhắc nộp.</p>
        </div>
      )}

      {history.length > 0 && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Lịch sử hoá đơn</h3>
          <div>
            {history.map((h) => (
              <div key={h._id} className={styles.histRow}>
                <div className={styles.histMain}>
                  <span className={styles.histCode}>{h.code} · {h.direction === 'owner_pays' ? 'Bạn nộp' : 'Điều chỉnh đối soát'}{h.autoConfirmed ? ' · tự động xác nhận' : ''}</span>
                  <span className={styles.histMeta}>Kỳ {h.period}{h.confirmedAt ? ` · xác nhận ${new Date(h.confirmedAt).toLocaleDateString('vi-VN')}` : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <strong>{formatCurrency(h.amount)}</strong>
                  <Badge size="sm" style={{ background: SETTLEMENT_STATUS[h.status].bg, color: SETTLEMENT_STATUS[h.status].color }}>{SETTLEMENT_STATUS[h.status].label}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
