import { Star } from 'lucide-react'
import styles from './Rating.module.css'
import { clsx } from '@/utils'

const SIZE_PX = { sm: 12, md: 14, lg: 18 }

export default function Rating({ value = 0, max = 5, size = 'md', count, interactive = false, onChange, className }) {
  const stars = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <div className={clsx(styles.rating, styles[size], interactive && styles.interactive, className)}>
      {stars.map(star => {
        const isFilled = star <= Math.round(value)
        return (
          <button key={star} type="button" className={clsx(styles.star, isFilled ? styles.filled : styles.empty)}
            onClick={interactive ? () => onChange?.(star) : undefined} disabled={!interactive} aria-label={`${star} sao`}>
            <Star size={SIZE_PX[size] || 14} fill={isFilled ? 'currentColor' : 'none'} strokeWidth={isFilled ? 0 : 1.75} />
          </button>
        )
      })}
      {count !== undefined && <span className={styles.count}>({count.toLocaleString('vi-VN')})</span>}
    </div>
  )
}
