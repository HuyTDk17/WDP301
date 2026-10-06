import { Link } from 'react-router-dom'
import Button from '@/components/ui/Button/Button'
import styles from './NotFound.module.css'

export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon}>🧭</span>
        <h1 className={styles.code}>404</h1>
        <h2 className={styles.title}>Không tìm thấy trang</h2>
        <p className={styles.message}>Trang bạn tìm không tồn tại hoặc đã được di chuyển.</p>
        <Link to="/"><Button>Về trang chủ</Button></Link>
      </div>
    </div>
  )
}
