import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Users, CalendarDays, MapPin, Clock, AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Modal from '@/components/ui/Modal/Modal'
import Avatar from '@/components/ui/Avatar/Avatar'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { playerService, LEVELS, levelLabel } from '@/services/playerService'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { SPORTS, getSport, formatDate, formatTime } from '@/utils'
import f from '@/components/dashboard/form.module.css'
import styles from './Players.module.css'

const PAGE_SIZE = 9

export default function PlayerList() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [filters, setFilters] = useState({ sport: '', level: '', date: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ posts: [], totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [target, setTarget] = useState(null)   // bài đang xin tham gia
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    playerService.getPosts({ page, limit: PAGE_SIZE, sport: filters.sport || undefined, level: filters.level || undefined, date: filters.date || undefined })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [page, filters])
  useEffect(() => { load() }, [load])

  const setFilter = (k) => (e) => { setFilters((s) => ({ ...s, [k]: e.target.value })); setPage(1) }

  const openJoin = (post) => { setTarget(post); setMessage('') }
  const sendJoin = async () => {
    setSending(true)
    try {
      await playerService.joinPost(target._id, message.trim())
      toast.success('Đã gửi yêu cầu. Chủ nhóm sẽ phản hồi qua thông báo.')
      setTarget(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Không thể gửi yêu cầu')
    } finally {
      setSending(false)
    }
  }

  const action = (p) => {
    if (p.isMine) return <Link to="/players/mine"><Button size="sm" variant="outline" fullWidth>Bài của bạn</Button></Link>
    if (p.myRequest === 'pending') return <Button size="sm" variant="outline" fullWidth disabled>Đã gửi yêu cầu</Button>
    if (p.myRequest === 'accepted') return <Link to="/players/mine?tab=requests"><Button size="sm" fullWidth>Đã được nhận — xem liên hệ</Button></Link>
    if (p.myRequest === 'rejected') return <Button size="sm" variant="outline" fullWidth disabled>Chưa được nhận</Button>
    return <Button size="sm" fullWidth onClick={() => openJoin(p)} disabled={!user?.phone}>Xin tham gia</Button>
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.head}>
          <p className={styles.eyebrow}>Tìm người chơi</p>
          <h1 className={styles.title}>Thiếu người? Ghép nhóm ngay</h1>
          <p className={styles.sub}>Xin vào các buổi chơi còn chỗ trống. Chủ nhóm duyệt xong, hai bên sẽ thấy số điện thoại để liên lạc.</p>
          <Link to="/players/mine" className={styles.mineLink}>Nhóm &amp; yêu cầu của tôi →</Link>
        </header>

        {!user?.phone && (
          <div className={styles.notice}>
            <AlertCircle size={16} />
            <span>Bạn cần cập nhật <Link to="/profile">số điện thoại</Link> trong hồ sơ để xin tham gia hoặc đăng bài.</span>
          </div>
        )}

        <div className={styles.filters}>
          <select className={f.control} value={filters.sport} onChange={setFilter('sport')}>
            <option value="">Tất cả môn</option>
            {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
          <select className={f.control} value={filters.level} onChange={setFilter('level')}>
            <option value="">Mọi trình độ</option>
            {LEVELS.filter((l) => l.value !== 'any').map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <input className={f.control} type="date" value={filters.date} onChange={setFilter('date')} />
          {(filters.sport || filters.level || filters.date) && <Button variant="ghost" size="sm" onClick={() => { setFilters({ sport: '', level: '', date: '' }); setPage(1) }}>Xóa lọc</Button>}
        </div>

        {loading ? (
          <div className={styles.center}><Spinner size="lg" /></div>
        ) : error ? (
          <EmptyState icon={<Users size={48} />} title="Không tải được danh sách" description="Vui lòng thử lại sau ít phút." />
        ) : data.posts.length === 0 ? (
          <EmptyState icon={<Users size={48} />} title="Chưa có nhóm nào đang tìm người" description="Bạn có lượt đặt sân sắp tới? Vào Lịch đặt sân và bấm “Tìm thêm người” để đăng bài." />
        ) : (
          <>
            <div className={styles.grid}>
              {data.posts.map((p) => {
                const sport = getSport(p.sport)
                const left = Math.max(0, p.slotsNeeded - p.acceptedCount)
                return (
                  <div key={p._id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span className={styles.sport}>{sport ? `${sport.icon} ${sport.name}` : 'Thể thao'}</span>
                      <span className={styles.level}>{levelLabel(p.level)}</span>
                    </div>
                    <p className={styles.meta}><MapPin size={14} /> {p.venueName}{p.courtName ? ` · ${p.courtName}` : ''}</p>
                    <p className={styles.meta}><CalendarDays size={14} /> {formatDate(p.date)}</p>
                    <p className={styles.meta}><Clock size={14} /> {formatTime(p.startTime)}–{formatTime(p.endTime)}</p>
                    {p.note && <p className={styles.note}>{p.note}</p>}
                    <div className={styles.host}>
                      <Avatar src={p.host?.avatar} name={p.host?.name} size="sm" />
                      <span>{p.host?.name}</span>
                      <span className={styles.slots}>Còn {left} chỗ</span>
                    </div>
                    {action(p)}
                  </div>
                )
              })}
            </div>
            {data.totalPages > 1 && (
              <div className={styles.pager}>
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Trang trước</Button>
                <span>Trang {page}/{data.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage((n) => n + 1)}>Trang sau</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={!!target} onClose={() => !sending && setTarget(null)} title="Xin tham gia nhóm" footer={
        <>
          <Button variant="outline" onClick={() => setTarget(null)} disabled={sending}>Hủy</Button>
          <Button onClick={sendJoin} loading={sending}>Gửi yêu cầu</Button>
        </>
      }>
        {target && (
          <div className={f.form}>
            <p className={f.hint}>{target.venueName} · {formatDate(target.date)} · {formatTime(target.startTime)}–{formatTime(target.endTime)}</p>
            <label className={f.field}>
              <span className={f.label}>Lời nhắn cho chủ nhóm</span>
              <textarea className={f.control} rows={3} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Giới thiệu ngắn: trình độ, kinh nghiệm, vị trí hay chơi..." />
              <span className={f.hint}>{message.length}/200 · Số điện thoại của bạn chỉ hiện với chủ nhóm sau khi họ nhận bạn.</span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
