import { useState, useEffect } from 'react'
import { Zap, Mail, Percent, Save, Info, Repeat, Clock, Wallet, CreditCard } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Input from '@/components/ui/Input/Input'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { settingsService } from '@/services/settingsService'
import { useToast } from '@/contexts/ToastContext'
import styles from './AdminSettings.module.css'

/**
 * Dòng giải thích bằng ví dụ cụ thể: giá sân 200.000đ → khách trả bao nhiêu, chủ sân
 * nhận bao nhiêu. Cùng công thức với backend (utils/commission.js).
 */
function commissionHint(ratePct, sharePct) {
  const price = 200000
  const total = Math.round(price * (Number(ratePct) || 0) / 100)
  const customerPart = Math.round(total * Math.min(100, Math.max(0, Number(sharePct) || 0)) / 100)
  const ownerPart = total - customerPart
  const vnd = (n) => n.toLocaleString('vi-VN') + 'đ'
  return `0 = chủ sân chịu hết, 50 = chia đôi, 100 = khách chịu hết. Ví dụ sân ${vnd(price)}/giờ: khách trả ${vnd(price + customerPart)}, chủ sân nhận ${vnd(price - ownerPart)}, nền tảng thu ${vnd(total)}.`
}

export default function AdminSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    platformName: '', supportEmail: '', commissionRate: 5, commissionCustomerSharePct: 0,
    commissionDueDays: 7, commissionGraceDays: 3, commissionBlockEnabled: true, commissionAutoIssueEnabled: true,
    gatewayFeeRate: 0.015,
    transferEnabled: true, transferMinLeadTimeHours: 2, maxTransfersPerBooking: 1,
    quoteTtlMinutes: 10, ownerApprovalTimeoutMinutes: 30,
    transferFeeMin: 5000, transferFeeMax: 100000, transferFixedFeeT5: 10000,
    maxRefundRatio: 0.5, refundToCreditEnabled: true,
    bankName: '', bankBin: '', bankAccountNumber: '', bankAccountName: '',
    bankTransferWindowMinutes: 30,
  })
  // Biểu phí bậc thang chỉnh riêng vì là mảng, không hợp với ô nhập đơn giản.
  const [feeTiers, setFeeTiers] = useState([])
  const [compTiers, setCompTiers] = useState([])
  const [cancelTiers, setCancelTiers] = useState([])

  useEffect(() => {
    settingsService.getPlatformSettings()
      .then((res) => {
        const st = res.settings
        setForm((f) => ({
          ...f,
          platformName: st.platformName || '',
          supportEmail: st.supportEmail || '',
          commissionRate: st.commissionRate ?? 5,
          commissionCustomerSharePct: st.commissionCustomerSharePct ?? 0,
          commissionDueDays: st.commissionDueDays ?? 7,
          commissionGraceDays: st.commissionGraceDays ?? 3,
          commissionBlockEnabled: st.commissionBlockEnabled ?? true,
          commissionAutoIssueEnabled: st.commissionAutoIssueEnabled ?? true,
          gatewayFeeRate: st.gatewayFeeRate ?? 0.015,
          transferEnabled: st.transferEnabled !== false,
          transferMinLeadTimeHours: st.transferMinLeadTimeHours ?? 2,
          maxTransfersPerBooking: st.maxTransfersPerBooking ?? 1,
          quoteTtlMinutes: st.quoteTtlMinutes ?? 10,
          ownerApprovalTimeoutMinutes: st.ownerApprovalTimeoutMinutes ?? 30,
          transferFeeMin: st.transferFeeMin ?? 5000,
          transferFeeMax: st.transferFeeMax ?? 100000,
          transferFixedFeeT5: st.transferFixedFeeT5 ?? 10000,
          maxRefundRatio: st.maxRefundRatio ?? 0.5,
          refundToCreditEnabled: st.refundToCreditEnabled !== false,
          bankName: st.bankName || '',
          bankBin: st.bankBin || '',
          bankAccountNumber: st.bankAccountNumber || '',
          bankAccountName: st.bankAccountName || '',
          bankTransferWindowMinutes: st.bankTransferWindowMinutes ?? 30,
        }))
        setFeeTiers(st.transferFeeTiers || [])
        setCompTiers(st.compensationTiers || [])
        setCancelTiers(st.cancellationTiers || [])
      })
      .catch(() => toast.error('Không thể tải cài đặt hệ thống'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await settingsService.updatePlatformSettings({
        ...form,
        transferFeeTiers: feeTiers,
        compensationTiers: compTiers,
        cancellationTiers: cancelTiers,
      })
      toast.success('Đã lưu cài đặt — áp dụng ngay cho lượt đặt sân tiếp theo')
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu cài đặt')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <PageHeader title="Cài đặt hệ thống" subtitle="Cấu hình cài đặt toàn nền tảng" />
      <form className={styles.contentCard} onSubmit={handleSave}>
        <h3 className={styles.sectionTitle}>Cấu hình nền tảng</h3>
        <div className={styles.formGrid}>
          <Input
            label="Tên nền tảng"
            value={form.platformName}
            onChange={e => setForm(f => ({ ...f, platformName: e.target.value }))}
            icon={<Zap size={15} />}
          />
          <Input
            label="Email hỗ trợ"
            type="email"
            value={form.supportEmail}
            onChange={e => setForm(f => ({ ...f, supportEmail: e.target.value }))}
            icon={<Mail size={15} />}
          />
          <Input
            label="Tỉ lệ hoa hồng nền tảng"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={form.commissionRate}
            onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))}
            icon={<Percent size={15} />}
            suffix="%"
            hint="Tính trên giá sân của mỗi lượt đặt. Áp dụng cho lượt đặt mới tạo sau khi lưu — không ảnh hưởng các lượt đặt đã có."
          />
          <Input
            label="Khách chịu bao nhiêu % hoa hồng"
            type="number"
            min={0}
            max={100}
            step={5}
            value={form.commissionCustomerSharePct}
            onChange={e => setForm(f => ({ ...f, commissionCustomerSharePct: e.target.value }))}
            icon={<Percent size={15} />}
            suffix="%"
            hint={commissionHint(form.commissionRate, form.commissionCustomerSharePct)}
          />
          <Input
            label="Hạn nộp phí dịch vụ"
            type="number"
            min={1}
            max={90}
            value={form.commissionDueDays}
            onChange={e => setForm(f => ({ ...f, commissionDueDays: e.target.value }))}
            suffix="ngày"
            hint="Khách chuyển tiền thẳng cho chủ sân nên phí dịch vụ thu theo hoá đơn lập vào ngày 1 hằng tháng. Đây là số ngày chủ sân có để nộp kể từ khi nhận hoá đơn (mặc định 7)."
          />
          <label className={styles.checkRow}>
            <input type="checkbox" checked={!!form.commissionAutoIssueEnabled} onChange={e => setForm(f => ({ ...f, commissionAutoIssueEnabled: e.target.checked }))} />
            <span>Tự động lập hoá đơn phí dịch vụ vào ngày 1 hằng tháng</span>
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={!!form.commissionBlockEnabled} onChange={e => setForm(f => ({ ...f, commissionBlockEnabled: e.target.checked }))} />
            <span>Khoá địa điểm của chủ sân nộp phí dịch vụ quá hạn (ẩn khỏi hệ thống, không nhận đặt mới; đơn đã đặt vẫn giữ nguyên)</span>
          </label>
          {form.commissionBlockEnabled && (
            <Input
              label="Ân hạn trước khi khoá"
              type="number"
              min={0}
              max={90}
              value={form.commissionGraceDays}
              onChange={e => setForm(f => ({ ...f, commissionGraceDays: e.target.value }))}
              suffix="ngày"
              hint="Quá hạn nộp + ngần này ngày mà chưa nộp thì địa điểm bị khoá. Mặc định 7 + 3 = 10 ngày kể từ khi lập hoá đơn. Chủ sân đã báo chuyển khoản (chờ bạn đối chiếu) thì không bị khoá."
            />
          )}
        </div>

        <h3 className={styles.sectionTitle}>Tài khoản nền tảng (nhận phí dịch vụ)</h3>
        <p className={styles.sectionHint}>
          Chỉ dùng để chủ sân <strong>nộp phí dịch vụ</strong> theo hoá đơn hằng tháng. Tài khoản này <strong>không hiển thị</strong> khi
          người chơi thanh toán: đặt sân, tiền bù và phí chuyển sân đều chuyển thẳng vào tài khoản của chủ sân, chủ sân tự xác nhận và tự hoàn tiền.
          Quản trị viên chỉ vận hành hệ thống và thu phí dịch vụ. Muốn hệ thống <strong>tự xác nhận</strong> khi tiền về, cấu hình webhook của SePay/Casso trỏ về <code>/api/webhooks/bank</code> và đặt <code>BANK_WEBHOOK_SECRET</code> (xem deploy/DEPLOY.md); chưa cấu hình thì bạn vẫn xác nhận tay ở trang Đối soát.
        </p>
        <div className={styles.formGrid}>
          <Input
            label="Tên ngân hàng"
            placeholder="Ngân hàng TMCP Á Châu (ACB)"
            value={form.bankName}
            onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
            icon={<CreditCard size={15} />}
          />
          <Input
            label="Mã BIN ngân hàng"
            placeholder="970416"
            value={form.bankBin}
            onChange={e => setForm(f => ({ ...f, bankBin: e.target.value }))}
            icon={<CreditCard size={15} />}
            hint="Tra mã BIN theo chuẩn Napas tại https://api.vietqr.io/v2/banks — bắt buộc để tạo được mã QR."
          />
          <Input
            label="Số tài khoản"
            value={form.bankAccountNumber}
            onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
            icon={<Wallet size={15} />}
          />
          <Input
            label="Tên chủ tài khoản"
            placeholder="CONG TY TNHH ESPORT360"
            value={form.bankAccountName}
            onChange={e => setForm(f => ({ ...f, bankAccountName: e.target.value.toUpperCase() }))}
            icon={<Wallet size={15} />}
            hint="Viết không dấu, đúng như trên tài khoản ngân hàng."
          />
          <Input
            label="Cửa sổ chờ chuyển khoản"
            type="number" min={5} max={180} step={5}
            value={form.bankTransferWindowMinutes}
            onChange={e => setForm(f => ({ ...f, bankTransferWindowMinutes: e.target.value }))}
            icon={<Clock size={15} />}
            suffix="phút"
            hint="Đơn tự huỷ nếu quá thời gian này mà khách chưa báo đã chuyển khoản."
          />
        </div>
        <h3 className={styles.sectionTitle}>Tham số kế toán</h3>
        <div className={styles.formGrid}>
          <Input
            label="Phí cổng thanh toán"
            type="number" min={0} max={1} step={0.001}
            value={form.gatewayFeeRate}
            onChange={e => setForm(f => ({ ...f, gatewayFeeRate: e.target.value }))}
            icon={<CreditCard size={15} />}
            hint="Dạng thập phân: 0.015 = 1,5%. Được TRỪ khỏi lợi nhuận ròng của nền tảng."
          />
        </div>

        <h3 className={styles.sectionTitle}>Chuyển sân</h3>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            checked={form.transferEnabled}
            onChange={e => setForm(f => ({ ...f, transferEnabled: e.target.checked }))}
          />
          <span>Cho phép khách hàng chuyển sân thay vì huỷ</span>
        </label>

        <div className={styles.formGrid}>
          <Input
            label="Thời gian tối thiểu trước giờ đá"
            type="number" min={0} max={72} step={1}
            value={form.transferMinLeadTimeHours}
            onChange={e => setForm(f => ({ ...f, transferMinLeadTimeHours: e.target.value }))}
            icon={<Clock size={15} />}
            suffix="giờ"
            hint="Dưới ngưỡng này chủ sân không kịp bán lại khung giờ, nên chỉ cho huỷ chứ không cho chuyển."
          />
          <Input
            label="Số lần chuyển tối đa mỗi lượt đặt"
            type="number" min={0} max={10} step={1}
            value={form.maxTransfersPerBooking}
            onChange={e => setForm(f => ({ ...f, maxTransfersPerBooking: e.target.value }))}
            icon={<Repeat size={15} />}
            hint="Chống dùng chuyển sân như công cụ giữ chỗ trôi nổi."
          />
          <Input
            label="Hiệu lực báo giá"
            type="number" min={1} max={60} step={1}
            value={form.quoteTtlMinutes}
            onChange={e => setForm(f => ({ ...f, quoteTtlMinutes: e.target.value }))}
            suffix="phút"
            hint="Cũng là thời gian giữ chỗ khung giờ đích."
          />
          <Input
            label="Hạn chủ sân phản hồi"
            type="number" min={1} max={1440} step={5}
            value={form.ownerApprovalTimeoutMinutes}
            onChange={e => setForm(f => ({ ...f, ownerApprovalTimeoutMinutes: e.target.value }))}
            suffix="phút"
            hint="Quá hạn thì yêu cầu tự huỷ và hoàn 100% cho khách."
          />
          <Input
            label="Phí chuyển sân tối thiểu"
            type="number" min={0} step={1000}
            value={form.transferFeeMin}
            onChange={e => setForm(f => ({ ...f, transferFeeMin: e.target.value }))}
            suffix="đ"
            hint="Sàn để khoản thu đủ bù chi phí giao dịch. Không áp dụng khi tỉ lệ phí bằng 0."
          />
          <Input
            label="Phí chuyển sân tối đa"
            type="number" min={0} step={1000}
            value={form.transferFeeMax}
            onChange={e => setForm(f => ({ ...f, transferFeeMax: e.target.value }))}
            suffix="đ"
            hint="Trần để đơn giá trị lớn không phải chịu mức phí vô lý."
          />
          <Input
            label="Phí sang tên (T5)"
            type="number" min={0} step={1000}
            value={form.transferFixedFeeT5}
            onChange={e => setForm(f => ({ ...f, transferFixedFeeT5: e.target.value }))}
            suffix="đ"
            hint="Khoản cố định, không phụ thuộc giá trị đơn."
          />
          <Input
            label="Trần hoàn tiền mặt"
            type="number" min={0} max={1} step={0.05}
            value={form.maxRefundRatio}
            onChange={e => setForm(f => ({ ...f, maxRefundRatio: e.target.value }))}
            icon={<Wallet size={15} />}
            hint="0.5 = tối đa hoàn 50% số đã trả bằng tiền mặt; phần vượt chuyển thành số dư khuyến mãi. Chặn hành vi đặt sân đắt rồi chuyển sang sân rẻ để rút tiền."
          />
        </div>

        <TierEditor
          title="Biểu phí chuyển sân (tỉ lệ trên giá sân của lượt đặt gốc)"
          tiers={feeTiers}
          onChange={setFeeTiers}
          columns={[
            { key: 'sameVenueRate', label: 'Cùng địa điểm' },
            { key: 'sameOwnerRate', label: 'Cùng chủ sân' },
            { key: 'crossOwnerRate', label: 'Khác chủ sân' },
          ]}
        />

        <TierEditor
          title="Biểu bồi thường chủ sân cũ (chỉ áp dụng khi chuyển sang chủ sân khác)"
          tiers={compTiers}
          onChange={setCompTiers}
          columns={[{ key: 'rate', label: 'Tỉ lệ bồi thường' }]}
        />

        <TierEditor
          title="Biểu hoàn tiền khi huỷ đơn"
          tiers={cancelTiers}
          onChange={setCancelTiers}
          columns={[{ key: 'refundRate', label: 'Tỉ lệ hoàn tiền sân' }]}
        />

        <p className={styles.notice}>
          <Info size={15} className={styles.noticeIcon} />
          Biểu hoàn tiền khi huỷ nên được đặt KÉM hấp dẫn hơn biểu phí chuyển sân. Khi đó khách bận đột xuất
          sẽ thấy chuyển sân luôn rẻ hơn huỷ, và giao dịch được giữ lại cho cả ba bên thay vì biến mất.
        </p>

        <p className={styles.notice}>
          <Info size={15} className={styles.noticeIcon} />
          Tỉ lệ hoa hồng này thay thế con số 5% từng được viết cứng trong mã nguồn — thay đổi ở đây sẽ áp dụng ngay cho phí dịch vụ hiển thị cho khách hàng, cách tính doanh thu nền tảng, và không cần khởi động lại server.
        </p>

        <div className={styles.actions}>
          <Button type="submit" icon={<Save size={16} />} loading={saving}>Lưu thay đổi</Button>
        </div>
      </form>
    </div>
  )
}

/**
 * Chỉnh biểu phí bậc thang. Mỗi bậc gồm ngưỡng giờ còn lại và các tỉ lệ tương
 * ứng. Nhập bằng PHẦN TRĂM cho dễ hiểu, lưu xuống dạng thập phân 0–1 theo đúng
 * định dạng backend mong đợi.
 */
function TierEditor({ title, tiers, onChange, columns }) {
  const update = (index, key, value) => {
    const next = tiers.map((t, i) => (i === index ? { ...t, [key]: value } : t))
    onChange(next)
  }

  if (!tiers.length) return null

  return (
    <div className={styles.tierBlock}>
      <h4 className={styles.tierTitle}>{title}</h4>
      <div className={styles.tierTable}>
        <div className={styles.tierHead}>
          <span>Còn lại từ (giờ)</span>
          {columns.map(c => <span key={c.key}>{c.label}</span>)}
        </div>
        {tiers.map((tier, i) => (
          <div key={i} className={styles.tierRow}>
            <input
              className={styles.tierInput}
              type="number" min={0} step={1}
              value={tier.minLeadHours}
              onChange={e => update(i, 'minLeadHours', Number(e.target.value))}
            />
            {columns.map(c => (
              <div key={c.key} className={styles.tierPct}>
                <input
                  className={styles.tierInput}
                  type="number" min={0} max={100} step={1}
                  value={Math.round((tier[c.key] || 0) * 100)}
                  onChange={e => update(i, c.key, Number(e.target.value) / 100)}
                />
                <span>%</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
