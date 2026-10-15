import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Clock3, MapPin, Plus, Search, UserPlus, Users } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Spinner from '@/components/ui/Spinner/Spinner'
import { useAuth } from '@/contexts/authState'
import { useToast } from '@/contexts/ToastContext'
import { playerMatchService } from '@/services/playerMatchService'
import { formatDate } from '@/utils'
import styles from './PlayerMatches.module.css'

const SPORTS = ['Bóng đá', 'Cầu lông', 'Bóng rổ', 'Bóng chuyền', 'Tennis', 'Pickleball', 'Khác']
const EMPTY_FORM = { sport: SPORTS[0], area: '', date: '', startTime: '', endTime: '', maxPlayers: 10, description: '' }

function localDateInput() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

export default function PlayerMatches() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [joiningId, setJoiningId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [filters, setFilters] = useState({ area: '', sport: '', date: '' })

  const loadMatches = useCallback(async () => {
    setLoading(true)
    try {
      const result = await playerMatchService.list(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))
      setMatches(result.matches || [])
    } catch (error) {
      toast.error(error?.message || 'Không thể tải danh sách trận')
    } finally {
      setLoading(false)
    }
  }, [filters, toast])

  useEffect(() => { loadMatches() }, [loadMatches])

  const handleCreate = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await playerMatchService.create({ ...form, maxPlayers: Number(form.maxPlayers) })
      setForm(EMPTY_FORM)
      toast.success('Đã đăng trận tìm người chơi')
      await loadMatches()
    } catch (error) {
      toast.error(error?.message || 'Không thể tạo trận')
    } finally {
      setSubmitting(false)
    }
  }

  const handleJoin = async (match) => {
    setJoiningId(match._id)
    try {
      await playerMatchService.join(match._id)
      toast.success('Bạn đã tham gia trận')
      await loadMatches()
    } catch (error) {
      toast.error(error?.message || 'Không thể tham gia trận')
    } finally {
      setJoiningId('')
    }
  }

  return (
    <main className={styles.page}>
      <div className="container">
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>CỘNG ĐỒNG</p><h1>Tìm người chơi</h1><p>Tham gia một trận đang mở hoặc rủ mọi người cùng chơi.</p></div>
          <span className={styles.headerIcon}><Users size={23} /></span>
        </header>

        <div className={styles.layout}>
          <form className={styles.createForm} onSubmit={handleCreate}>
            <h2><Plus size={18} /> Đăng trận mới</h2>
            <label>Môn thể thao<select value={form.sport} onChange={(event) => setForm({ ...form, sport: event.target.value })}>{SPORTS.map((sport) => <option key={sport}>{sport}</option>)}</select></label>
            <label>Khu vực<input value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} placeholder="Ví dụ: Cầu Giấy, Hà Nội" maxLength={100} required /></label>
            <div className={styles.formRow}>
              <label>Ngày chơi<input type="date" min={localDateInput()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
              <label>Số người tối đa<input type="number" min="2" max="30" value={form.maxPlayers} onChange={(event) => setForm({ ...form, maxPlayers: event.target.value })} required /></label>
            </div>
            <div className={styles.formRow}>
              <label>Bắt đầu<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /></label>
              <label>Kết thúc<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required /></label>
            </div>
            <label>Ghi chú<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Trình độ, cách chia sân hoặc lời nhắn" maxLength={300} rows={3} /></label>
            <Button type="submit" icon={<Plus size={16} />} loading={submitting} fullWidth>Đăng tìm người chơi</Button>
          </form>

          <section className={styles.results}>
            <div className={styles.filters}>
              <label className={styles.search}><Search size={16} /><input aria-label="Tìm theo khu vực" placeholder="Tìm theo khu vực" value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })} /></label>
              <select aria-label="Lọc môn thể thao" value={filters.sport} onChange={(event) => setFilters({ ...filters, sport: event.target.value })}>
                <option value="">Tất cả môn</option>{SPORTS.map((sport) => <option key={sport}>{sport}</option>)}
              </select>
              <input aria-label="Lọc theo ngày" type="date" min={localDateInput()} value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
            </div>

            {loading ? <div className={styles.loading}><Spinner size="lg" /></div> : matches.length === 0 ? (
              <EmptyState icon={<Users size={42} />} title="Chưa có trận phù hợp" description="Thử đổi bộ lọc hoặc đăng trận mới để tìm người chơi." />
            ) : (
              <div className={styles.matchList}>{matches.map((match) => {
                const joined = match.players?.some((player) => String(player.userId?._id || player.userId) === String(user?._id))
                const isCreator = String(match.creatorId?._id || match.creatorId) === String(user?._id)
                const isFull = match.status === 'full' || match.players.length >= match.maxPlayers
                return (
                  <article className={styles.match} key={match._id}>
                    <div className={styles.matchTop}><span className={styles.sport}>{match.sport}</span><span className={styles.capacity}>{match.players.length}/{match.maxPlayers} người</span></div>
                    <h2>{match.area}</h2>
                    <div className={styles.meta}><span><CalendarDays size={14} />{formatDate(match.date)}</span><span><Clock3 size={14} />{match.startTime} – {match.endTime}</span></div>
                    <p className={styles.host}>Người đăng: <strong>{match.creatorId?.name || 'Thành viên'}</strong></p>
                    {match.description && <p className={styles.description}>{match.description}</p>}
                    <div className={styles.matchFooter}>
                      <span><MapPin size={14} />{match.players.length} người đã tham gia</span>
                      {joined || isCreator ? <span className={styles.joined}>{isCreator ? 'Trận của bạn' : 'Đã tham gia'}</span> : isFull ? <span className={styles.capacity}>Đã đủ người</span> : (
                        <Button size="sm" icon={<UserPlus size={14} />} loading={joiningId === match._id} onClick={() => handleJoin(match)}>Tham gia</Button>
                      )}
                    </div>
                  </article>
                )
              })}</div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}