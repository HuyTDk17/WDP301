import { forwardRef } from 'react'
import styles from './Input.module.css'
import { clsx } from '@/utils'

const Input = forwardRef(function Input({ label, error, hint, icon, iconRight, prefix, suffix, size = 'md', fullWidth = true, className, containerClassName, type = 'text', ...props }, ref) {
  return (
    <div className={clsx(styles.wrapper, fullWidth && styles.fullWidth, containerClassName)}>
      {label && <label className={styles.label}>{label}{props.required && <span className={styles.required}>*</span>}</label>}
      <div className={clsx(styles.inputWrapper, error && styles.hasError, icon && styles.hasIconLeft, iconRight && styles.hasIconRight)}>
        {icon && <span className={styles.iconLeft}>{icon}</span>}
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <input ref={ref} type={type} className={clsx(styles.input, styles[size], className)} {...props} />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
        {iconRight && <span className={styles.iconRight}>{iconRight}</span>}
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {hint && !error && <p className={styles.hint}>{hint}</p>}
    </div>
  )
})
export default Input
