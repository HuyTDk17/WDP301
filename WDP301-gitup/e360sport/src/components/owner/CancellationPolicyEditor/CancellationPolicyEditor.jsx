import { useState, useEffect, useCallback } from 'react'
import { Plus, X, ShieldCheck } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { cancellationPolicyService } from '@/services/cancellationPolicyService'
import { floorViolation, describeTiers } from '@/utils/cancellationPolicy'
import { useToast } from '@/contexts/ToastContext'
import styles from './CancellationPolicyEditor.module.css'

const MAX_TIERS = 8
const toRows = (tiers) => [...tiers].sort((a, b) => b.minLeadHours - a.minLeadHours).map((t) => ({ hours: String(t.minLeadHours), pct: String(Math.round(t.refundRate * 100)) }))
const fromRows = (rows) => rows.map((r) => ({ minLeadHours: Number(r.hours), refundRate: Math.round(Number(r.pct)) / 100 }))

/** Chủ sân tự đặt biểu hoàn tiền khi khách hủy. Máy chủ kiểm tra lại mọi quy tắc (đây chỉ là gợi ý tức thời). */
export default function CancellationPolicyEditor() {
  const { toast } = useToast()
  const [info, setInfo] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    cancellationPolicyService.get()
      .then((res) => {
        setInfo(res)
        setEnabled(res.enabled)
        // Chưa có biểu riêng: bắt đầu từ biểu chung của nền tảng cho dễ chỉnh
        setRows(toRows(res.tiers.length ? res.tiers : res.platformTiers))
      })
      .catch(() => toast.error('Không thể tải chính sách hủy'))
  }, [])
  useEffect(() => { load() }, [load])

  if (!info) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>

  const setRow = (i, key, value) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  const tiers = fromRows(rows)

  // Gợi ý tức thời
  const shapeOk = rows.length > 0 && rows.every((r) => r.hours !== '' && r.pct !== '' && Number.isInteger(Number(r.hours)) && Number(r.hours) >= 0 && Number(r.pct) >= 0 && Number(r.pct) <= 100)
  const hasZero = tiers.some((t) => t.minLeadHours === 0)
  const unique = new Set(tiers.map((t) => t.minLeadHours)).size === tiers.length
  const sorted = [...tiers].sort((a, b) => b.minLeadHours - a.minLeadHours)
  const monotonic = sorted.every((t, i) => i === 0 || t.refundRate <= sorted[i - 1].refundRate)
  const structureError = !shapeOk ? 'Mỗi bậc cần số giờ nguyên ≥ 0 và tỉ lệ từ 0 đến 100%'
    : !hasZero ? 'Cần có bậc 0 giờ (báo hủy sát giờ)'
    : !unique ? 'Có hai bậc trùng số giờ'
    : !monotonic ? 'Báo hủy càng sớm thì hoàn càng nhiều — hãy kiểm tra lại thứ tự các mức'
    : ''
  const violation = !structureError ? floorViolation(tiers, info.floorTiers) : null
  const blocked = enabled && (structureError || violation)

  const save = async () => {
    setSaving(true)
    try {
      const res = await cancellationPolicyService.save(enabled, tiers)
      toast.success(enabled ? 'Đã lưu và bật chính sách hủy riêng' : 'Đã lưu bản nháp, đang dùng chính sách chung')
      setInfo(res)
      setRows(toRows(res.tiers))
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu chính sách')
    } finally {
      setSaving(false)
    }
  }

  if (!info.allowed) {
    return (
      <div className={styles.wrap}>
        <h3 className={styles.title}>Chính sách hủy</h3>
        <p className={styles.note}>Quản trị viên hiện không cho phép chủ sân tự đặt chính sách hủy. Mọi lượt đặt dùng chính sách chung của nền tảng.</p>
        <PolicyTable title="Chính sách chung đang áp dụng" tiers={info.platformTiers} />
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>Chính sách hủy của bạn</h3>
      <p className={styles.sub}>
        Quy định khách được hoàn bao nhiêu tiền sân tùy theo báo hủy trước bao lâu. Chính sách <strong>chỉ áp dụng cho lượt đặt mới</strong> sau khi lưu —
        khách đã đặt trước đó vẫn giữ điều kiện cũ. Phần tiền không hoàn thuộc về bạn; phí dịch vụ không hoàn.
      </p>

      {info.floorWarning && enabled && (
        <p className={styles.warn}>Biểu đã lưu của bạn không còn đạt mức tối thiểu hiện tại của nền tảng nên <strong>đang dùng chính sách chung</strong>. {info.floorWarning}.</p>
      )}

      <label className={styles.switch}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Dùng chính sách hủy riêng cho các địa điểm của tôi</span>
      </label>
      <p className={styles.hint}>Đang áp dụng: <strong>{info.effective.source === 'owner' ? 'chính sách riêng của bạn' : 'chính sách chung của nền tảng'}</strong></p>

      <div className={styles.floor}>
        <ShieldCheck size={16} />
        <div>
          <p>Mức hoàn <strong>tối thiểu</strong> theo quy định của nền tảng (bạn có thể hoàn nhiều hơn, không ít hơn):</p>
          <ul>{describeTiers(info.floorTiers).map((l) => <li key={l.when}>{l.when}: ≥ {Math.round(l.rate * 100)}%</li>)}</ul>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.head}><span>Khi báo hủy trước (từ … giờ)</span><span>Hoàn tiền sân (%)</span><span /></div>
        {rows.map((r, i) => (
          <div key={i} className={styles.row}>
            <input type="number" min="0" max="720" step="1" value={r.hours} onChange={(e) => setRow(i, 'hours', e.target.value)} aria-label="Số giờ" />
            <input type="number" min="0" max="100" step="1" value={r.pct} onChange={(e) => setRow(i, 'pct', e.target.value)} aria-label="Phần trăm hoàn" />
            <button type="button" className={styles.remove} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} disabled={rows.length <= 1} aria-label="Xóa bậc"><X size={14} /></button>
          </div>
        ))}
        {rows.length < MAX_TIERS && (
          <Button type="button" size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setRows((rs) => [...rs, { hours: '', pct: '' }])}>Thêm bậc</Button>
        )}
      </div>

      {enabled && (structureError || violation) && <p className={styles.error}>{structureError || violation}</p>}

      {!structureError && <PolicyTable title="Khách sẽ thấy" tiers={tiers} />}

      <div className={styles.actions}>
        <Button onClick={save} loading={saving} disabled={!!blocked}>Lưu chính sách</Button>
      </div>
    </div>
  )
}

function PolicyTable({ title, tiers }) {
  return (
    <div className={styles.preview}>
      <p className={styles.previewTitle}>{title}</p>
      <ul>{describeTiers(tiers).map((l) => <li key={l.when}><span>{l.when}</span><strong>{l.rate === 0 ? 'Không hoàn' : `Hoàn ${Math.round(l.rate * 100)}%`}</strong></li>)}</ul>
    </div>
  )
}
