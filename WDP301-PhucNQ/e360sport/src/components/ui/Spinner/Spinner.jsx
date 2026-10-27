import styles from './Spinner.module.css'
import { clsx } from '@/utils'

export default function Spinner({ size = 'md', color = 'primary', className }) {
  return <span className={clsx(styles.spinner, styles[size], styles[color], className)} aria-label="Đang tải" role="status" />
}
