import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Users, CalendarDays, MapPin, Clock, Check, X } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Avatar from '@/components/ui/Avatar/Avatar'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import ContactButtons from '@/components/players/ContactButtons/ContactButtons'
import { playerService, levelLabel } from '@/services/playerService'
import { useToast } from '@/contexts/ToastContext'
import { getSport, formatDate, formatTime } from '@/utils'
import styles from './Players.module.css'

const POST_STATUS = {
  open: ['Đang tìm người', 'badgeOpen'],
  full: ['Đã đủ người', 'badgeFull'],
  closed: ['Đã đóng', 'badgeClosed'],
  ended: ['Đã diễn ra', 'badgeClosed'],
}
const REQUEST_STATUS = {
  pending: ['Chờ phản hồi', 'badgeOpen'],
  accepted: ['Đã được nhận', 'badgeFull'],
  rejected: ['Chưa được nhận', 'badgeClosed'],
}
const phaseOfPost = (p) => (p.status !== 'closed' && new Date(p.startsAt) < new Date() ? 'ended' : p.status)

export default function MyPlayers() {
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'requests' ? 'requests' : 'posts'
  const [posts, setPosts] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')              // id đang xử lý
  const [closeTarget, setCloseTarget] = useState(null)
  const [leaveTarget, setLeaveTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([playerService.getMyPosts(), playerService.getMyRequests()])
      .then(([a, b]) => { setPosts(a.posts || []); setRequests(b.requests || []) })
      .catch(() => toast.error('Không thể tải dữ liệu'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (id, fn, okMsg) => {
    setBusy(id)
    try { await fn(); toast.success(okMsg); load() }
    catch (err) { toast.error(err?.message || 'Thao tác không thành công'); load() }
    finally { setBusy('') }
  }

  const sportLabel = (key) => { const s = getSport(key); return s ? `${s.icon} ${s.name}` : 'Thể thao' }
  const pendingTotal = posts.reduce((n, p) => n + (p.requests || []).filter((r) => r.status === 'pending').length, 0)

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.head}>
          <h1 className={styles.title}>Nhóm &amp; yêu cầu của tôi</h1>
          <Link to="/players" className={styles.mineLink}>← Xem các nhóm đang tìm người</Link>
        </header>

        <div className={styles.tabs}>
          <button type="button" className={`${styles.tab} ${tab === 'posts' ? styles.tabActive : ''}`} onClick={() => setParams({})}>
            Bài của tôi{pendingTotal > 0 && <span className={styles.dot}>{pendingTotal}</span>}
          </button>
          <button type="button" className={`${styles.tab} ${tab === 'requests' ? styles.tabActive : ''}`} onClick={() => setParams({ tab: 'requests' })}>Yêu cầu của tôi</button>
        </div>

        {loading ? (
          <div className={styles.center}><Spinner size="lg" /></div>
        ) : tab === 'posts' ? (
          posts.length === 0 ? (
            <EmptyState icon={<Users size={48} />} title="Bạn chưa đăng bài nào" description="Vào Lịch đặt sân, chọn lượt đặt đã xác nhận rồi bấm “Tìm thêm người”." />
          ) : (
            <div className={styles.stack}>
              {posts.map((p) => {
                const phase = phaseOfPost(p)
                const [label, cls] = POST_STATUS[phase]
                const live = phase === 'open' || phase === 'full'
                return (
                  <div key={p._id} className={styles.panel}>
                    <div className={styles.panelHead}>
                      <div>
                        <p className={styles.panelTitle}>{sportLabel(p.sport)} · {p.venueName}</p>
                        <p className={styles.meta}><CalendarDays size={14} /> {formatDate(p.date)} · <Clock size={14} /> {formatTime(p.startTime)}–{formatTime(p.endTime)} · {levelLabel(p.level)}</p>
                      </div>
                      <span className={`${styles.badge} ${styles[cls]}`}>{label}</span>
                    </div>
                    <p className={styles.meta}><Users size={14} /> Đã nhận {p.acceptedCount}/{p.slotsNeeded} người</p>
                    {p.closedReason && <p className={styles.note}>Đã đóng: {p.closedReason}</p>}

                    {(p.requests || []).length > 0 && (
                      <ul className={styles.reqList}>
                        {p.requests.map((r) => {
                          const [rl, rc] = REQUEST_STATUS[r.status] || REQUEST_STATUS.pending
                          return (
                            <li key={r._id} className={styles.req}>
                              <div className={styles.reqTop}>
                                <Avatar src={r.user?.avatar} name={r.user?.name} size="sm" />
                                <div className={styles.reqWho}>
                                  <strong>{r.user?.name}</strong>
                                  {r.message && <span className={styles.msg}>“{r.message}”</span>}
                                </div>
                                <span className={`${styles.badge} ${styles[rc]}`}>{rl}</span>
                              </div>
                              {r.status === 'pending' && live && (
                                <div className={styles.reqActions}>
                                  <Button size="sm" icon={<Check size={14} />} loading={busy === r._id} onClick={() => act(r._id, () => playerService.respond(r._id, 'accept'), 'Đã nhận người chơi')}>Nhận</Button>
                                  <Button size="sm" variant="outline" icon={<X size={14} />} disabled={busy === r._id} onClick={() => act(r._id, () => playerService.respond(r._id, 'reject'), 'Đã từ chối')}>Từ chối</Button>
                                </div>
                              )}
                              {r.contact && <ContactButtons contact={r.contact} />}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    {live && <div><Button size="sm" variant="outline" onClick={() => setCloseTarget(p)}>Đóng bài</Button></div>}
                  </div>
                )
              })}
            </div>
          )
        ) : requests.length === 0 ? (
          <EmptyState icon={<Users size={48} />} title="Bạn chưa xin vào nhóm nào" description="Xem các nhóm đang thiếu người và gửi yêu cầu tham gia." action={undefined} />
        ) : (
          <div className={styles.stack}>
            {requests.map((r) => {
              const p = r.post
              const [rl, rc] = REQUEST_STATUS[r.status] || REQUEST_STATUS.pending
              const groupLive = p && p.status !== 'closed' && new Date(p.startsAt) > new Date()
              return (
                <div key={r._id} className={styles.panel}>
                  <div className={styles.panelHead}>
                    <div>
                      <p className={styles.panelTitle}>{p ? `${sportLabel(p.sport)} · ${p.venueName}` : 'Nhóm không còn tồn tại'}</p>
                      {p && <p className={styles.meta}><CalendarDays size={14} /> {formatDate(p.date)} · <Clock size={14} /> {formatTime(p.startTime)}–{formatTime(p.endTime)}</p>}
                    </div>
                    <span className={`${styles.badge} ${styles[rc]}`}>{rl}</span>
                  </div>
                  {p?.host && <p className={styles.meta}><MapPin size={14} /> Chủ nhóm: {p.host.name}</p>}
                  {p?.status === 'closed' && <p className={styles.note}>Nhóm này đã đóng.</p>}
                  {r.contact && <ContactButtons contact={r.contact} />}
                  {['pending', 'accepted'].includes(r.status) && groupLive && (
                    <div><Button size="sm" variant="outline" onClick={() => (r.status === 'accepted' ? setLeaveTarget(r) : act(r._id, () => playerService.withdraw(r._id), 'Đã rút yêu cầu'))} loading={busy === r._id}>
                      {r.status === 'accepted' ? 'Rút khỏi nhóm' : 'Rút yêu cầu'}
                    </Button></div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        onConfirm={async () => { const id = closeTarget._id; setCloseTarget(null); await act(id, () => playerService.closePost(id), 'Đã đóng bài') }}
        title="Đóng bài tìm người"
        message="Những người đã xin và đã được nhận sẽ nhận thông báo nhóm đã đóng. Bạn vẫn có thể đăng bài mới cho lượt đặt khác."
        confirmLabel="Đóng bài"
      />
      <ConfirmModal
        isOpen={!!leaveTarget}
        onClose={() => setLeaveTarget(null)}
        onConfirm={async () => { const id = leaveTarget._id; setLeaveTarget(null); await act(id, () => playerService.withdraw(id), 'Đã rút khỏi nhóm') }}
        title="Rút khỏi nhóm"
        message="Chủ nhóm sẽ được báo và chỗ của bạn được mở lại cho người khác. Bạn có thể xin lại sau."
        confirmLabel="Rút khỏi nhóm"
      />
    </div>
  )
}
