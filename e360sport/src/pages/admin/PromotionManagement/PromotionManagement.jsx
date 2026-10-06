import { useState, useEffect, useCallback } from 'react'
import { Tag, Plus, Pencil, Trash2, Ban, Play, Percent, DollarSign } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import Modal from '@/components/ui/Modal/Modal'
import Input from '@/components/ui/Input/Input'
import Button from '@/components/ui/Button/Button'
import { promotionService } from '@/services/promotionService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/utils'
import styles from './PromotionManagement.module.css'

const EMPTY_FORM = {
  code: '', description: '', discountType: 'percent', discountValue: '',
  maxDiscountAmount: '', minBookingAmount: '', startDate: '', endDate: '', maxUses: '',
}

function PromotionFormModal({ isOpen, onClose, onSubmit, editing }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      setForm({
        code: editing.code,
        description: editing.description || '',
        discountType: editing.discountType,
        discountValue: editing.discountValue,
        maxDiscountAmount: editing.maxDiscountAmount || '',
        minBookingAmount: editing.minBookingAmount || '',
        startDate: editing.startDate?.slice(0, 10) || '',
        endDate: editing.endDate?.slice(0, 10) || '',
        maxUses: editing.maxUses || '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [isOpen, editing])

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit({
        ...form,
        discountValue: Number(form.discountValue),
        maxDiscountAmount: Number(form.maxDiscountAmount) || 0,
        minBookingAmount: Number(form.minBookingAmount) || 0,
        maxUses: Number(form.maxUses) || 0,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const valid = form.code.trim() && form.discountValue > 0 && form.startDate && form.endDate

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Sửa mã khuyến mãi' : 'Tạo mã khuyến mãi mới'} size="md" footer={
      <>
        <Button variant="outline" onClick={onClose} disabled={submitting}>Hủy</Button>
        <Button onClick={handleSubmit} loading={submitting} disabled={!valid}>{editing ? 'Lưu thay đổi' : 'Tạo mã'}</Button>
      </>
    }>
      <div className={styles.form}>
        <Input label="Mã khuyến mãi" value={form.code} onChange={set('code')} disabled={!!editing} placeholder="VD: SUMMER2026" icon={<Tag size={15} />} />
        <Input label="Mô tả (không bắt buộc)" value={form.description} onChange={set('description')} placeholder="VD: Khuyến mãi mùa hè" />
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.label}>Loại giảm giá</label>
            <select className={styles.select} value={form.discountType} onChange={set('discountType')}>
              <option value="percent">Giảm theo % </option>
              <option value="fixed">Giảm số tiền cố định</option>
            </select>
          </div>
          <Input
            label={form.discountType === 'percent' ? 'Giá trị (%)' : 'Giá trị (VNĐ)'}
            type="number" min={0} max={form.discountType === 'percent' ? 100 : undefined}
            value={form.discountValue} onChange={set('discountValue')}
            icon={form.discountType === 'percent' ? <Percent size={15} /> : <DollarSign size={15} />}
          />
        </div>
        {form.discountType === 'percent' && (
          <Input label="Giảm tối đa (VNĐ, để trống = không giới hạn)" type="number" min={0} value={form.maxDiscountAmount} onChange={set('maxDiscountAmount')} />
        )}
        <Input label="Đơn tối thiểu để áp dụng (VNĐ)" type="number" min={0} value={form.minBookingAmount} onChange={set('minBookingAmount')} />
        <div className={styles.formRow}>
          <Input label="Ngày bắt đầu" type="date" value={form.startDate} onChange={set('startDate')} />
          <Input label="Ngày kết thúc" type="date" value={form.endDate} onChange={set('endDate')} />
        </div>
        <Input label="Số lượt dùng tối đa (để trống = không giới hạn)" type="number" min={0} value={form.maxUses} onChange={set('maxUses')} />
        <p className={styles.note}>Giảm giá được nền tảng tự chịu (trừ vào phí dịch vụ), không ảnh hưởng số tiền chủ sân nhận được.</p>
      </div>
    </Modal>
  )
}

export default function PromotionManagement() {
  const { toast } = useToast()
  const [promotions, setPromotions] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    promotionService.getPromotionsAdmin()
      .then((res) => setPromotions(res.promotions || []))
      .catch(() => toast.error('Không thể tải danh sách khuyến mãi'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (promo) => { setEditing(promo); setFormOpen(true) }

  const handleSubmit = async (data) => {
    try {
      if (editing) {
        await promotionService.updatePromotion(editing._id, data)
        toast.success('Đã cập nhật mã khuyến mãi')
      } else {
        await promotionService.createPromotion(data)
        toast.success('Đã tạo mã khuyến mãi mới')
      }
      setFormOpen(false)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu mã khuyến mãi')
    }
  }

  const toggleStatus = async (promo) => {
    try {
      await promotionService.togglePromotionStatus(promo._id)
      toast.success(promo.isActive ? 'Đã tắt mã khuyến mãi' : 'Đã bật lại mã khuyến mãi')
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái')
    }
  }

  const handleDelete = async () => {
    try {
      await promotionService.deletePromotion(deleteTarget._id)
      toast.success('Đã xóa mã khuyến mãi')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa mã khuyến mãi')
    }
  }

  const now = new Date()
  const columns = [
    { header: 'Mã', accessor: 'code', render: v => <span className={styles.code}>{v}</span> },
    {
      header: 'Giảm giá', accessor: 'discountValue', render: (v, row) => (
        <span>{row.discountType === 'percent' ? `${v}%` : formatCurrency(v)}{row.discountType === 'percent' && row.maxDiscountAmount > 0 && <span className={styles.capNote}> (tối đa {formatCurrency(row.maxDiscountAmount)})</span>}</span>
      ),
    },
    {
      header: 'Thời gian', accessor: 'startDate', render: (v, row) => (
        <span className={styles.dateRange}>{new Date(v).toLocaleDateString('vi-VN')} – {new Date(row.endDate).toLocaleDateString('vi-VN')}</span>
      ),
    },
    { header: 'Đã dùng', accessor: 'usedCount', render: (v, row) => <span>{v}{row.maxUses > 0 ? `/${row.maxUses}` : ''}</span> },
    {
      header: 'Trạng thái', accessor: 'isActive', render: (v, row) => {
        const expired = new Date(row.endDate) < now
        if (!v) return <StatusBadge status="inactive" />
        if (expired) return <StatusBadge status="expired" />
        return <StatusBadge status="active" />
      },
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Khuyến mãi" subtitle={`${promotions.length} mã khuyến mãi`} actions={<Button icon={<Plus size={16} />} onClick={openCreate}>Tạo mã mới</Button>} />

      <DataTable
        columns={columns}
        data={promotions}
        loading={loading}
        searchPlaceholder="Tìm theo mã..."
        emptyText="Chưa có mã khuyến mãi nào"
        actions={(row) => (
          <>
            <Button size="xs" variant="ghost" title="Sửa" onClick={() => openEdit(row)}><Pencil size={13} /></Button>
            <Button size="xs" variant={row.isActive ? 'outline' : 'success'} title={row.isActive ? 'Tắt mã' : 'Bật lại'} onClick={() => toggleStatus(row)}>
              {row.isActive ? <Ban size={13} /> : <Play size={13} />}
            </Button>
            <Button size="xs" variant="danger" title="Xóa" onClick={() => setDeleteTarget(row)}><Trash2 size={13} /></Button>
          </>
        )}
      />

      <PromotionFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} editing={editing} />

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Xóa mã khuyến mãi" size="sm" footer={
        <>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Hủy</Button>
          <Button variant="danger" onClick={handleDelete}>Xóa</Button>
        </>
      }>
        <p>Xóa mã "{deleteTarget?.code}"? Các booking đã dùng mã này trước đó không bị ảnh hưởng.</p>
      </Modal>
    </div>
  )
}
