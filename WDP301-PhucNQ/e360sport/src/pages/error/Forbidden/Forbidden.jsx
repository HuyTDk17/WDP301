import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/authState'
import Button from '@/components/ui/Button/Button'
import styles from './Forbidden.module.css'

const ROLE_HOME = { customer: '/', owner: '/owner/dashboard', admin: '/admin/dashboard' }

export default function Forbidden() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const homePath = ROLE_HOME[user?.role] || '/'

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon}>🧭</span>
        <h1 className={styles.code}>404</h1>
        <h2 className={styles.title}>Không tìm thấy trang</h2>
        <div className={styles.actions}>
          <Button onClick={() => navigate(-1)} variant="outline">← Quay lại</Button>
          <Link to={homePath}><Button>Về trang chủ</Button></Link>
        </div>
      </div>
    </div>
  )
}
