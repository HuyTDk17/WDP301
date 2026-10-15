import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import Button from '@/components/ui/Button/Button'
import Badge from '@/components/ui/Badge/Badge'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { venueService } from '@/services/venueService'
import { useToast } from '@/contexts/ToastContext'
import styles from './VenueApproval.module.css'

export default function VenueApproval() {
  const { toast } = useToast()
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [processing, setProcessing] = useState(false)

  const loadVenues = useCallback(() => {
    setLoading(true)
    venueService.getAllVenuesPending()
      .then((res) => setVenues(res.venues || []))
      .catch(() => toast.error('Không thể tải danh sách địa điểm chờ duyệt'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadVenues() }, [loadVenues])

  const approve = async (id) => {
    setProcessing(true)
    try {
      await venueService.approveVenue(id)
      toast.success('Đã duyệt địa điểm')
      setSelected(null)
      loadVenues()
    } catch (err) {
      toast.error(err?.message || 'Không thể duyệt địa điểm')
    } finally {
      setProcessing(false)
    }
  }

  const reject = async (id) => {
    setProcessing(true)
    try {
      await venueService.rejectVenue(id, 'Không đáp ứng tiêu chuẩn nền tảng')
      toast.success('Đã từ chối địa điểm')
      setSelected(null)
      loadVenues()
    } catch (err) {
      toast.error(err?.message || 'Không thể từ chối địa điểm')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return <div className={styles.loadingState}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <PageHeader title="Duyệt địa điểm" subtitle="Xem và duyệt địa điểm do chủ sân gửi lên" actions={<Badge variant="warning" size="lg">{venues.length} chờ duyệt</Badge>} />

      {venues.length === 0 ? (
        <EmptyState icon="🎉" title="Không có địa điểm nào chờ duyệt" description="Tất cả địa điểm đã được xử lý." />
      ) : (
        <div className={styles.layout}>
          <div className={styles.list}>
            {venues.map(v => (
              <button key={v._id} className={`${styles.venueItem} ${selected?._id === v._id ? styles.venueItemActive : ''}`} onClick={() => setSelected(v)}>
                <img src={v.images?.[0] || 'https://placehold.co/80x60/e5e9f2/8a94a6?text=SV'} alt={v.name} className={styles.venueThumb} />
                <div className={styles.venueItemInfo}><h4 className={styles.venueItemName}>{v.name}</h4><p className={styles.venueItemMeta}>{v.ownerId?.name} · {v.address?.city}</p></div>
              </button>
            ))}
          </div>
          {selected ? (
            <div className={styles.detail}>
              <img src={selected.images?.[0] || 'https://placehold.co/700x240/e5e9f2/8a94a6?text=ESport360'} alt={selected.name} className={styles.detailImg} />
              <div className={styles.detailContent}>
                <h2 className={styles.detailName}>{selected.name}</h2>
                <p className={styles.detailOwner}>của {selected.ownerId?.name} ({selected.ownerId?.email}) · {selected.address?.city}</p>
                <p className={styles.detailDesc}>{selected.description || 'Chưa có mô tả'}</p>
                {selected.amenities?.length > 0 && <p className={styles.detailAmenities}>Tiện ích: {selected.amenities.join(', ')}</p>}
                <div className={styles.detailActions}>
                  <Button variant="success" size="lg" loading={processing} onClick={() => approve(selected._id)}>✓ Duyệt địa điểm</Button>
                  <Button variant="danger" size="lg" loading={processing} onClick={() => reject(selected._id)}>✕ Từ chối</Button>
                </div>
              </div>
            </div>
          ) : <div className={styles.detailPlaceholder}><span>👈</span><p>Chọn một địa điểm để xem chi tiết</p></div>}
        </div>
      )}
    </div>
  )
}
