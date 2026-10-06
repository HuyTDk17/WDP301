import { Inbox } from 'lucide-react'
import styles from './EmptyState.module.css'
import Button from '../Button/Button'

export default function EmptyState({ icon = <Inbox size={48} />, title, description, action, actionLabel }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.icon}>{icon}</div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && actionLabel && <Button onClick={action} className={styles.action}>{actionLabel}</Button>}
    </div>
  )
}
