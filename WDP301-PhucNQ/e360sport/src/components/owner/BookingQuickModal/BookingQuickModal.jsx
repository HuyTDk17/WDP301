import { useState } from 'react'
import { LandPlot, Clock, Wallet, Calendar, User, Phone, Pin } from 'lucide-react'
import Modal from '@/components/ui/Modal/Modal'
import Button from '@/components/ui/Button/Button'
import Input from '@/components/ui/Input/Input'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import { formatCurrency, formatTime, getSport } from '@/utils'
import styles from './BookingQuickModal.module.css'

export default function BookingQuickModal({ isOpen, onClose, mode, booking, slotInfo, onConfirmStatus, onCreateBooking }) {
  const [form, setForm] = useState({ customerName: '', phone: '' })
  // Môn do SÂN quyết định (chủ sân khai khi tạo sân) — không chọn lại ở đây
  const sport = getSport(slotInfo?.sport)
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    try {
      await onCreateBooking?.(form)
      setForm({ customerName: '', phone: '' })
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'view' && booking) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Chi tiết lượt đặt sân" footer={
        booking.status === 'pending' ? (<><Button variant="danger" onClick={() => onConfirmStatus('cancelled')}>Hủy</Button><Button variant="success" onClick={() => onConfirmStatus('confirmed')}>Xác nhận</Button></>) :
        booking.status === 'confirmed' ? <Button onClick={() => onConfirmStatus('completed')}>Đánh dấu hoàn tất</Button> : null
      }>
        <div className={styles.viewBody}>
          <div className={styles.viewHeader}>
            <div className={styles.viewAvatar}>{booking.customer.name[0]}</div>
            <div><p className={styles.viewName}>{booking.customer.name}</p><p className={styles.viewPhone}>{booking.customer.phone}</p></div>
            <StatusBadge status={booking.status} />
          </div>
          <div className={styles.viewGrid}>
            <div className={styles.viewItem}><span><LandPlot size={13} /> Địa điểm / Sân</span><strong>{booking.venueName} · {booking.courtName}</strong></div>
            <div className={styles.viewItem}><span><Clock size={13} /> Giờ</span><strong>{formatTime(booking.startTime)} – {formatTime(booking.endTime)}</strong></div>
            <div className={styles.viewItem}><span><Wallet size={13} /> Số tiền</span><strong className={styles.amount}>{formatCurrency(booking.amount)}</strong></div>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tạo lượt đặt sân" footer={<><Button variant="outline" onClick={onClose}>Hủy</Button><Button onClick={handleCreate} loading={loading} disabled={!form.customerName || !form.phone}>Tạo lượt đặt</Button></>}>
      <div className={styles.createBody}>
        {slotInfo && (
          <div className={styles.slotSummary}>
            <div className={styles.slotSummaryRow}><span><LandPlot size={14} /></span><strong>{slotInfo.venueName} · {slotInfo.courtName}</strong></div>
            <div className={styles.slotSummaryRow}><span><Calendar size={14} /></span><strong>{slotInfo.date}</strong></div>
            <div className={styles.slotSummaryRow}><span><Clock size={14} /></span><strong>{formatTime(slotInfo.time)} – {formatTime(slotInfo.endTime)}</strong></div>
            <div className={styles.slotSummaryRow}><span><Wallet size={14} /></span><strong className={styles.amount}>{formatCurrency(slotInfo.pricePerHour)}</strong></div>
          </div>
        )}
        <div className={styles.formGrid}>
          <Input label="Tên khách hàng" placeholder="VD: Nguyễn Văn A" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} icon={<User size={15} />} required />
          <Input label="Số điện thoại" placeholder="0901 234 567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} icon={<Phone size={15} />} required />
          <div className={styles.fieldGroup}><label className={styles.label}>Môn thể thao</label><div className={styles.fixedValue}>{sport ? `${sport.icon} ${sport.name}` : '—'}</div></div>
        </div>
        <p className={styles.note}><Pin size={13} /> Đây là lượt đặt sân thủ công/tại quầy.</p>
      </div>
    </Modal>
  )
}
