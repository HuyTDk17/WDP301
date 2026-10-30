import { Crown } from 'lucide-react'
import styles from './PremiumBadge.module.css'

/** Huy hiệu Premium. size: 'sm' (chỉ biểu tượng + chữ nhỏ) | 'md'. */
export default function PremiumBadge({ label = 'Premium', size = 'sm', className = '' }) {
  return (
    <span className={`${styles.badge} ${styles[size]} ${className}`} title="Thành viên Premium">
      <Crown size={size === 'md' ? 14 : 11} strokeWidth={2.5} />{label}
    </span>
  )
}
