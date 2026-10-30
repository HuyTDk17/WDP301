import { CalendarX } from 'lucide-react'
import { describeTiers } from '@/utils/cancellationPolicy'
import styles from './CancellationPolicy.module.css'

/** Chính sách hủy đang áp dụng cho lượt đặt MỚI tại địa điểm (của chủ sân hoặc của nền tảng). */
export default function CancellationPolicy({ policy }) {
  if (!policy?.tiers?.length) return null
  return (
    <section className={styles.wrap}>
      <h2 className={styles.title}><CalendarX size={18} /> Chính sách hủy sân</h2>
      <p className={styles.sub}>
        {policy.source === 'owner' ? 'Do chủ sân quy định.' : 'Theo quy định chung của nền tảng.'} Mức hoàn tính trên tiền thuê sân; phí dịch vụ không hoàn.
        Muốn đổi sang giờ khác thay vì hủy? Bạn có thể <strong>đổi lịch hoặc chuyển sân</strong> với chi phí thường thấp hơn.
      </p>
      <ul className={styles.list}>
        {describeTiers(policy.tiers).map((l) => (
          <li key={l.when}>
            <span>{l.when}</span>
            <strong className={l.rate === 0 ? styles.none : ''}>{l.rate === 0 ? 'Không hoàn tiền' : `Hoàn ${Math.round(l.rate * 100)}%`}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}
