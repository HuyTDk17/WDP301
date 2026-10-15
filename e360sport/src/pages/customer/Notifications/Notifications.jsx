import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import styles from './Notifications.module.css'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { notificationService } from '@/services/notificationService'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/authState'

export default function Notifications() {
  const { toast } = useToast()
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const loadNotifications = useCallback(() => {
    setLoading(true)
    notificationService.getNotifications()
      .then((res) => setNotifications(res.notifications || []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadNotifications() }, [loadNotifications])

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead()
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    } catch {
      toast.error('Không thể đánh dấu đã đọc')
    }
  }

  const handleOpen = async (n) => {
    if (!n.read) {
      setNotifications(prev => prev.map(item => item._id === n._id ? { ...item, read: true } : item))
      try { await notificationService.markAsRead(n._id) } catch { /* trạng thái đã đọc chỉ mang tính hiển thị, bỏ qua lỗi mạng */ }
    }
    if (n.link) {
      // Role của user có thể vừa đổi ở phía server (vd: admin vừa duyệt hồ sơ
      // chủ sân) trong khi phiên đăng nhập hiện tại vẫn đang nhớ role cũ.
      // Làm mới trước khi điều hướng để tránh bị chặn oan bởi ProtectedRoute.
      await refreshUser()
      navigate(n.link)
    }
  }

  const formatRelativeTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Vừa xong'
    if (minutes < 60) return `${minutes} phút trước`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} giờ trước`
    return `${Math.floor(hours / 24)} ngày trước`
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Thông báo</h1>
          {notifications.some(n => !n.read) && <button className={styles.markAllBtn} onClick={handleMarkAllRead}>Đánh dấu đã đọc tất cả</button>}
        </div>

        {loading ? (
          <div className={styles.loadingState}><Spinner size="lg" /></div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell size={48} />} title="Không có thông báo nào" description="Thông báo về lượt đặt sân và ưu đãi sẽ xuất hiện ở đây." />
        ) : (
          <div className={styles.list}>
            {notifications.map(n => (
              <button
                key={n._id}
                type="button"
                className={`${styles.notifItem} ${!n.read ? styles.unread : ''} ${n.link ? styles.clickable : ''}`}
                onClick={() => handleOpen(n)}
                disabled={!n.link}
              >
                <div className={styles.notifIconWrap}>{n.icon || <Bell size={18} />}</div>
                <div className={styles.notifBody}>
                  <div className={styles.notifHeader}><h3 className={styles.notifTitle}>{n.title}</h3>{!n.read && <Badge variant="primary" size="sm">Mới</Badge>}</div>
                  <p className={styles.notifMessage}>{n.message}</p>
                  <span className={styles.notifTime}>{formatRelativeTime(n.createdAt)}</span>
                </div>
                {n.link && <span className={styles.notifArrow}>›</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
