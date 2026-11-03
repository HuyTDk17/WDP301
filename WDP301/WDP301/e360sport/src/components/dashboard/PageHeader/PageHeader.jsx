import styles from './PageHeader.module.css'

export default function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className={styles.header}>
      {breadcrumb && (
        <div className={styles.breadcrumb}>
          {breadcrumb.map((b, i) => (
            <span key={i} className={styles.crumb}>
              {i > 0 && <span className={styles.sep}>›</span>}
              {b.href ? <a href={b.href} className={styles.crumbLink}>{b.label}</a> : <span className={b.active ? styles.crumbActive : styles.crumbText}>{b.label}</span>}
            </span>
          ))}
        </div>
      )}
      <div className={styles.row}>
        <div className={styles.left}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  )
}
