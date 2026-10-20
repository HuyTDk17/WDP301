import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, LandPlot, SearchX, Trophy, MapPin, LayoutGrid, AlertTriangle, Pencil, Pause, Play, Trash2 } from 'lucide-react'
import { transferService } from '@/services/transferService'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import ConfirmModal from '@/components/dashboard/ConfirmModal/ConfirmModal'
import SearchFilter from '@/components/dashboard/SearchFilter/SearchFilter'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, getSport, getImageUrl } from '@/utils'
import styles from './ManageVenues.module.css'

const PLACEHOLDER_IMG = 'https://placehold.co/200x140/e5e9f2/8a94a6?text=ESport360'

export default function ManageVenues() {
  const { toast } = useToast()
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sportFilter, setSportFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const loadVenues = useCallback(() => {
    setLoading(true)
    venueService.getOwnerVenues()
      .then((res) => setVenues(res.venues || []))
      .catch(() => toast.error('Không thể tải danh sách địa điểm'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadVenues() }, [loadVenues])

  const filtered = venues.filter(v => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase()) || (v.address?.district || '').toLowerCase().includes(search.toLowerCase())
    const matchSport = !sportFilter || v.sports?.includes(sportFilter)
    return matchSearch && matchSport
  })

  const toggleStatus = async (id) => {
    try {
      await venueService.toggleVenueStatus(id)
      loadVenues()
    } catch (err) {
      toast.error(err?.message || 'Không thể cập nhật trạng thái')
    }
  }

  const handleDelete = async () => {
    try {
      await venueService.deleteVenue(deleteTarget._id)
      toast.success('Đã xóa địa điểm')
      setDeleteTarget(null)
      loadVenues()
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa địa điểm')
    }
  }

  const allSports = [...new Set(venues.flatMap(v => v.sports || []))]

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  const toggleTransferPolicy = async (venueId, requiresApproval) => {
    // Cập nhật lạc quan để ô tích phản hồi ngay, hoàn tác nếu máy chủ báo lỗi.
    setVenues((list) => list.map((v) => (v._id === venueId ? { ...v, transferRequiresApproval: requiresApproval } : v)))
    try {
      await transferService.setVenuePolicy(venueId, requiresApproval)
      toast.success(requiresApproval
        ? 'Từ giờ bạn sẽ tự duyệt các yêu cầu chuyển sân đến địa điểm này'
        : 'Khách có thể chuyển sân đến địa điểm này ngay, không cần chờ duyệt')
    } catch (err) {
      setVenues((list) => list.map((v) => (v._id === venueId ? { ...v, transferRequiresApproval: !requiresApproval } : v)))
      toast.error(err?.message || 'Không thể cập nhật thiết lập chuyển sân')
    }
  }

  // 'follow' (null) = theo cài đặt chuyển đến · 'always' = luôn duyệt · 'auto' = tự chấp nhận đổi lịch
  const rescheduleMode = (v) => (v.rescheduleRequiresApproval === true ? 'always' : v.rescheduleRequiresApproval === false ? 'auto' : 'follow')
  const changeRescheduleMode = async (venueId, mode) => {
    const value = { follow: null, always: true, auto: false }[mode]
    const previous = venues.find((v) => v._id === venueId)?.rescheduleRequiresApproval ?? null
    setVenues((list) => list.map((v) => (v._id === venueId ? { ...v, rescheduleRequiresApproval: value } : v)))
    try {
      await transferService.setRescheduleApproval(venueId, value)
      toast.success({ follow: 'Đổi lịch sẽ theo cài đặt duyệt chuyển đến', always: 'Bạn sẽ tự duyệt từng yêu cầu đổi lịch', auto: 'Khách đổi lịch được chấp nhận ngay, không cần chờ bạn' }[mode])
    } catch (err) {
      setVenues((list) => list.map((v) => (v._id === venueId ? { ...v, rescheduleRequiresApproval: previous } : v)))
      toast.error(err?.message || 'Không thể cập nhật thiết lập đổi lịch')
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Địa điểm của tôi" subtitle={`Đang quản lý ${venues.length} địa điểm`} actions={<Link to="/owner/venues/create"><Button icon={<Plus size={16} />}>Thêm địa điểm mới</Button></Link>} />

      {venues.length === 0 ? (
        <EmptyState
          icon={<LandPlot size={48} />}
          title="Bạn chưa có địa điểm nào"
          description="Đăng địa điểm đầu tiên để bắt đầu nhận đặt sân từ khách hàng."
          action={() => window.location.assign('/owner/venues/create')}
          actionLabel="Đăng địa điểm đầu tiên"
        />
      ) : (
        <>
          <SearchFilter
            value={search}
            onChange={setSearch}
            placeholder="Tìm địa điểm theo tên hoặc quận..."
            filters={[{ value: sportFilter, onChange: setSportFilter, placeholder: 'Tất cả môn', options: allSports.map(s => ({ value: s, label: getSport(s)?.name || s })) }]}
          />
          <div className={styles.venueList}>
            {filtered.length === 0 ? (
              <div className={styles.empty}><span><SearchX size={32} /></span><p>Không có địa điểm khớp với tìm kiếm của bạn</p></div>
            ) : filtered.map(venue => (
              <div key={venue._id} className={styles.venueCard}>
                <img src={getImageUrl(venue.images?.[0]) || PLACEHOLDER_IMG} alt={venue.name} className={styles.venueImg} />
                <div className={styles.venueInfo}>
                  <div className={styles.venueHeader}>
                    <h3 className={styles.venueName}>{venue.name}</h3>
                    <StatusBadge status={venue.isActive ? 'active' : 'inactive'} />
                  </div>
                  <div className={styles.venueMeta}>
                    <span><Trophy size={13} /> {venue.sports?.map(s => getSport(s)?.name || s).join(', ') || 'Chưa chọn môn'}</span>
                    <span><MapPin size={13} /> {venue.address?.district}, {venue.address?.city}</span>
                    <span><LayoutGrid size={13} /> {venue.courtCount || 0} sân{venue.minPricePerHour != null && ` · Từ ${formatCurrency(venue.minPricePerHour)}/giờ`}</span>
                  </div>
                  {venue.courtCount === 0 && (
                    <p className={styles.missingCourtsNote}><AlertTriangle size={13} /> Địa điểm này chưa có sân con nào — khách hàng sẽ không thể đặt sân cho tới khi bạn thêm sân và giá theo giờ.</p>
                  )}
                  {/* Mặc định TẮT: khách được chuyển đến ngay, không phải chờ
                      bạn phản hồi. Chỉ bật khi bạn thật sự muốn duyệt từng lượt. */}
                  <label className={styles.transferPolicy}>
                    <input
                      type="checkbox"
                      checked={!!venue.transferRequiresApproval}
                      onChange={(e) => toggleTransferPolicy(venue._id, e.target.checked)}
                    />
                    <span>Tự duyệt từng yêu cầu chuyển sân đến địa điểm này</span>
                  </label>
                  {/* Đổi lịch = khách đổi giờ/đổi sân trong CHÍNH địa điểm này. Mặc định theo ô tích bên trên. */}
                  <label className={styles.transferPolicy}>
                    <span>Yêu cầu đổi lịch của khách:</span>
                    <select value={rescheduleMode(venue)} onChange={(e) => changeRescheduleMode(venue._id, e.target.value)}>
                      <option value="follow">Theo cài đặt chuyển sân ở trên</option>
                      <option value="always">Luôn chờ tôi duyệt</option>
                      <option value="auto">Tự chấp nhận ngay</option>
                    </select>
                  </label>
                </div>
                <div className={styles.venueActions}>
                  <Link to={`/owner/venues/${venue._id}/edit`}><Button variant="outline" size="sm" icon={<Pencil size={13} />}>Sửa</Button></Link>
                  <Link to="/owner/courts"><Button variant="outline" size="sm" icon={<Trophy size={13} />}>Sân</Button></Link>
                  <Button variant={venue.isActive ? 'danger' : 'success'} size="sm" icon={venue.isActive ? <Pause size={13} /> : <Play size={13} />} onClick={() => toggleStatus(venue._id)}>
                    {venue.isActive ? 'Tạm dừng' : 'Kích hoạt'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(venue)}><Trash2 size={15} /></Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Xóa địa điểm" message={`Bạn có chắc muốn xóa "${deleteTarget?.name}"? Tất cả sân và dữ liệu liên quan sẽ bị ảnh hưởng.`} confirmLabel="Xóa địa điểm" icon={<Trash2 size={28} />} />
    </div>
  )
}
