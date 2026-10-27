import { useState, useEffect, useCallback } from 'react'
import { Plus, Trophy, Pencil, Trash2 } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import Input from '@/components/ui/Input/Input'
import Spinner from '@/components/ui/Spinner/Spinner'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, getSport } from '@/utils'
import styles from './CourtManagement.module.css'

const EMPTY_FORM = { name: '', venueId: '', type: 'football', size: '', surface: '', pricePerHour: '' }

export default function CourtManagement() {
  const { toast } = useToast()
  const [courts, setCourts] = useState([])
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formModal, setFormModal] = useState(null) // null | 'create' | đối tượng court (sửa)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([venueService.getOwnerCourts(), venueService.getOwnerVenues()])
      .then(([courtsRes, venuesRes]) => {
        setCourts(courtsRes.courts || [])
        setVenues(venuesRes.venues || [])
      })
      .catch(() => toast.error('Không thể tải danh sách sân'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const openCreate = () => {
    if (venues.length === 0) { toast.warning('Bạn cần tạo địa điểm trước khi thêm sân'); return }
    setForm({ ...EMPTY_FORM, venueId: venues[0]._id })
    setFormModal('create')
  }

  const openEdit = (court) => {
    setForm({ name: court.name, venueId: court.venueId, type: court.type, size: court.size || '', surface: court.surface || '', pricePerHour: court.pricePerHour })
    setFormModal(court)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { name: form.name, type: form.type, size: form.size, surface: form.surface, pricePerHour: Number(form.pricePerHour) }
      if (formModal === 'create') {
        await venueService.createCourt(form.venueId, payload)
        toast.success('Đã thêm sân mới')
      } else {
        await venueService.updateCourt(form.venueId, formModal._id, payload)
        toast.success('Đã cập nhật thông tin sân')
      }
      setFormModal(null)
      loadData()
    } catch (err) {
      toast.error(err?.message || 'Không thể lưu thông tin sân')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (court, newStatus) => {
    try {
      await venueService.updateCourtStatus(court.venueId, court._id, newStatus)
      loadData()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái sân')
    }
  }

  const handleDelete = async () => {
    try {
      await venueService.deleteCourt(deleteTarget.venueId, deleteTarget._id)
      toast.success('Đã xóa sân')
      setDeleteTarget(null)
      loadData()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa sân')
    }
  }

  const columns = [
    { header: 'Sân', accessor: 'name', render: (val, row) => <div className={styles.courtCell}><div className={styles.courtIcon}><Trophy size={15} /></div><div><p className={styles.courtName}>{val}</p><p className={styles.venueRef}>{row.venueName}</p></div></div> },
    { header: 'Loại', accessor: 'type', render: v => <span className={styles.typeTag}>{getSport(v)?.name || v}</span> },
    { header: 'Giá/giờ', accessor: 'pricePerHour', render: v => formatCurrency(v) },
    { header: 'Trạng thái', accessor: 'status', render: v => <StatusBadge status={v} /> },
  ]

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <PageHeader title="Quản lý sân" subtitle={`${courts.length} sân trên ${venues.length} địa điểm`} actions={<Button icon={<Plus size={16} />} onClick={openCreate}>Thêm sân</Button>} />

      {courts.length === 0 ? (
        <EmptyState
          icon={<Trophy size={48} />}
          title="Chưa có sân nào"
          description={venues.length === 0 ? 'Bạn cần tạo địa điểm trước khi thêm sân.' : 'Thêm sân con đầu tiên cho địa điểm của bạn để khách hàng có thể đặt.'}
          action={openCreate}
          actionLabel={venues.length === 0 ? 'Xem trang địa điểm' : 'Thêm sân đầu tiên'}
        />
      ) : (
        <DataTable
          columns={columns}
          data={courts}
          searchPlaceholder="Tìm sân..."
          actions={(row) => (
            <>
              <Button size="xs" variant="ghost" onClick={() => openEdit(row)}><Pencil size={13} /></Button>
              {row.status === 'active' ? <Button size="xs" variant="outline" onClick={() => toggleStatus(row, 'inactive')}>Tạm dừng</Button> : <Button size="xs" variant="success" onClick={() => toggleStatus(row, 'active')}>Kích hoạt</Button>}
              <Button size="xs" variant="danger" onClick={() => setDeleteTarget(row)}><Trash2 size={13} /></Button>
            </>
          )}
        />
      )}

      <Modal
        isOpen={!!formModal}
        onClose={() => setFormModal(null)}
        title={formModal === 'create' ? 'Thêm sân mới' : 'Sửa thông tin sân'}
        footer={<><Button variant="outline" onClick={() => setFormModal(null)}>Hủy</Button><Button onClick={handleSave} loading={saving} disabled={!form.name || !form.venueId || !form.pricePerHour}>{formModal === 'create' ? 'Tạo sân' : 'Lưu thay đổi'}</Button></>}
      >
        <div className={styles.formGrid}>
          <Input label="Tên sân" placeholder="VD: Sân A, Sân số 1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Địa điểm</label>
            <select className={styles.select} value={form.venueId} onChange={e => setForm(f => ({ ...f, venueId: e.target.value }))} disabled={formModal !== 'create'}>
              {venues.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Môn thể thao</label>
            <select className={styles.select} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {['football', 'badminton', 'tennis', 'basketball', 'volleyball', 'swimming', 'gym', 'yoga'].map(t => <option key={t} value={t}>{getSport(t)?.name || t}</option>)}
            </select>
          </div>
          <div className={styles.formRow}>
            <Input label="Kích thước (không bắt buộc)" placeholder="VD: 7 người, Tiêu chuẩn" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} />
            <Input label="Mặt sân (không bắt buộc)" placeholder="VD: Cỏ nhân tạo" value={form.surface} onChange={e => setForm(f => ({ ...f, surface: e.target.value }))} />
          </div>
          <Input label="Giá theo giờ (VNĐ)" type="number" placeholder="350000" prefix="₫" value={form.pricePerHour} onChange={e => setForm(f => ({ ...f, pricePerHour: e.target.value }))} required />
        </div>
      </Modal>

      <ConfirmModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Xóa sân" message={`Bạn có chắc muốn xóa "${deleteTarget?.name}"? Hành động này không thể hoàn tác.`} confirmLabel="Xóa" icon={<Trash2 size={28} />} />
    </div>
  )
}
