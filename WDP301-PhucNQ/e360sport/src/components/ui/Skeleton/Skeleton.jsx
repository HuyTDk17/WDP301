import styles from './Skeleton.module.css'
import { clsx } from '@/utils'

export default function Skeleton({ width, height, rounded = false, circle = false, className, count = 1 }) {
  const items = Array.from({ length: count }, (_, i) => (
    <span key={i} className={clsx(styles.skeleton, rounded && styles.rounded, circle && styles.circle, className)} style={{ width, height }} />
  ))
  return count === 1 ? items[0] : <div className={styles.stack}>{items}</div>
}
