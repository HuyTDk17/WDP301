import { ArrowUp, ArrowDown } from 'lucide-react'
import styles from './StatCard.module.css'

export default function StatCard({ icon, label, value, change, changeType = 'positive', color = 'primary', onClick }) {
  return (
    <div className={`${styles.card} ${onClick ? styles.clickable : ''}`} onClick={onClick}>
      <div className={styles.top}>
        <div className={`${styles.iconWrap} ${styles[color]}`}><span className={styles.icon}>{icon}</span></div>
        {change !== undefined && <span className={`${styles.change} ${styles[changeType]}`}>{changeType === 'positive' && <ArrowUp size={12} />}{changeType === 'negative' && <ArrowDown size={12} />} {change}</span>}
      </div>
      <p className={styles.value}>{value}</p>
      <p className={styles.label}>{label}</p>
    </div>
  )
}
