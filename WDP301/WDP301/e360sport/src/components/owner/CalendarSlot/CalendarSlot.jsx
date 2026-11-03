import { clsx } from '@/utils'
import styles from './CalendarSlot.module.css'

//Hiển thị các khung giờ và trạng thái đơn trên lịch
export default function CalendarSlot({ booking, isPast, onClick }) {
  if (!booking) {
    return <button className={clsx(styles.slot, styles.empty, isPast && styles.past)} onClick={onClick} disabled={isPast} title={isPast ? 'Đã qua' : 'Nhấn để đặt sân'}>{!isPast && <span className={styles.plus}>+</span>}</button>
  }
  return (
    <button className={clsx(styles.slot, styles.booked, styles[booking.status])} onClick={onClick} title={`${booking.customer.name} · ${booking.startTime}-${booking.endTime}`}>
      <span className={styles.dot} /><span className={styles.customerName}>{booking.customer.name.split(' ').pop()}</span>
    </button>
  )
}
