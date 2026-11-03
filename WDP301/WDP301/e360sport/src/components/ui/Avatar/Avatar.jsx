import styles from './Avatar.module.css'
import { getAvatarPlaceholder, getImageUrl } from '@/utils'
import { clsx } from '@/utils'

export default function Avatar({ src, name = '', size = 'md', online, className }) {
  const fallback = getAvatarPlaceholder(name || '?')
  const resolvedSrc = (src && getImageUrl(src)) || fallback
  return (
    <div className={clsx(styles.avatar, styles[size], className)}>
      <img src={resolvedSrc} alt={name} onError={e => { e.target.src = fallback }} />
      {online !== undefined && <span className={clsx(styles.status, online ? styles.online : styles.offline)} />}
    </div>
  )
}
