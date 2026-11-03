import styles from './Badge.module.css'
import { clsx } from '@/utils'

export default function Badge({ children, variant = 'default', size = 'md', dot, className }) {
  return <span className={clsx(styles.badge, styles[variant], styles[size], className)}>{dot && <span className={styles.dot} />}{children}</span>
}
