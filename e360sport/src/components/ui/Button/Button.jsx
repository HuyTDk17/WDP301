import styles from './Button.module.css'
import Spinner from '../Spinner/Spinner'
import { clsx } from '@/utils'

export default function Button({ children, variant = 'primary', size = 'md', fullWidth = false, loading = false, disabled = false, icon, iconRight, onClick, type = 'button', className, ...props }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={clsx(styles.btn, styles[variant], styles[size], fullWidth && styles.fullWidth, loading && styles.loading, className)} {...props}>
      {loading ? <Spinner size="sm" color={variant === 'primary' || variant === 'secondary' ? 'white' : 'primary'} /> : (
        <>{icon && <span className={styles.iconLeft}>{icon}</span>}{children}{iconRight && <span className={styles.iconRight}>{iconRight}</span>}</>
      )}
    </button>
  )
}
