import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, MapPin, X, Camera, AlertTriangle, ArrowLeft, ArrowRight, Save, Rocket } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { venueService } from '@/services/venueService'
import Button from '@/components/ui/Button/Button'
import Input from '@/components/ui/Input/Input'
import Spinner from '@/components/ui/Spinner/Spinner'
import { SPORTS, getImageUrl } from '@/utils'
import styles from './AddVenue.module.css'

const AMENITY_LIST = ['Bãi đỗ xe', 'Phòng thay đồ', 'Vòi sen', 'Cho thuê dụng cụ', 'Đèn chiếu sáng', 'Quầy giải khát', 'WiFi', 'Máy lạnh']
const STEPS = ['Thông tin cơ bản', 'Vị trí', 'Giờ mở cửa', 'Tiện ích', 'Hình ảnh']

const EMPTY_FORM = {
  name: '', description: '', sports: [],
  street: '', district: '', city: '',
  openTime: '06:00', closeTime: '22:00',
  amenities: [], rules: '',
}

export default function AddVenue({ editMode = false, venueId = null }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingVenue, setLoadingVenue] = useState(editMode)
  const [form, setForm] = useState(EMPTY_FORM)

  const [existingImages, setExistingImages] = useState([]) // ảnh đã có (khi sửa)
  const [newImageFiles, setNewImageFiles] = useState([])   // File objects mới chọn
  const [newImagePreviews, setNewImagePreviews] = useState([])

  // Nếu đang sửa, tải thông tin venue thật từ API để điền sẵn form
  useEffect(() => {
    if (!editMode || !venueId) return
    venueService.getVenueById(venueId)
      .then((res) => {
        const v = res.venue
        setForm({
          name: v.name || '', description: v.description || '', sports: v.sports || [],
          street: v.address?.street || '', district: v.address?.district || '', city: v.address?.city || '',
          openTime: v.openHours?.open || '06:00', closeTime: v.openHours?.close || '22:00',
          amenities: v.amenities || [], rules: v.rules || '',
        })
        setExistingImages(v.images || [])
      })
      .catch(() => toast.error('Không thể tải thông tin địa điểm này'))
      .finally(() => setLoadingVenue(false))
  }, [editMode, venueId])

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  const toggleSport = (id) => setForm(f => ({ ...f, sports: f.sports.includes(id) ? f.sports.filter(s => s !== id) : [...f.sports, id] }))
  const toggleAmenity = (a) => setForm(f => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a] }))

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setNewImageFiles(prev => [...prev, ...files])
    setNewImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  const removeNewImage = (index) => {
    setNewImageFiles(prev => prev.filter((_, i) => i !== index))
    setNewImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const removeExistingImage = (index) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('name', form.name)
      formData.append('description', form.description)
      form.sports.forEach(s => formData.append('sports', s))
      formData.append('street', form.street)
      formData.append('district', form.district)
      formData.append('city', form.city)
      formData.append('openHours[open]', form.openTime)
      formData.append('openHours[close]', form.closeTime)
      form.amenities.forEach(a => formData.append('amenities', a))
      formData.append('rules', form.rules)
      newImageFiles.forEach(file => formData.append('images', file))

      if (editMode) {
        await venueService.updateVenue(venueId, formData)
        toast.success('Cập nhật địa điểm thành công!')
        navigate('/owner/venues')
      } else {
        await venueService.createVenue(formData)
        toast.success('Đã đăng địa điểm thành công! Giờ hãy thêm sân con và giá theo giờ để khách hàng có thể đặt.')
        navigate('/owner/courts')
      }
    } catch (err) {
      toast.error(err?.message || (editMode ? 'Cập nhật địa điểm không thành công.' : 'Gửi địa điểm không thành công.'))
    } finally {
      setLoading(false)
    }
  }

  if (loadingVenue) {
    return <div className={styles.loadingState}><Spinner size="lg" /></div>
  }

  const totalImageCount = existingImages.length + newImagePreviews.length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{editMode ? 'Sửa địa điểm' : 'Thêm địa điểm mới'}</h1>
        <p className={styles.sub}>{editMode ? 'Cập nhật thông tin địa điểm' : 'Điền thông tin để đăng địa điểm lên ESport360. Địa điểm sẽ hiển thị công khai ngay sau khi bạn hoàn tất — đừng quên thêm sân con và giá theo giờ ở bước tiếp theo.'}</p>
      </div>

      <div className={styles.stepper}>
        {STEPS.map((s, i) => (
          <button key={s} className={`${styles.stepItem} ${step === i + 1 ? styles.stepActive : ''} ${step > i + 1 ? styles.stepDone : ''}`} onClick={() => step > i + 1 && setStep(i + 1)}>
            <div className={styles.stepCircle}>{step > i + 1 ? <Check size={14} /> : i + 1}</div>
            <span className={styles.stepLabel}>{s}</span>
          </button>
        ))}
      </div>

      <div className={styles.formCard}>
        {step === 1 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Thông tin cơ bản</h2>
            <div className={styles.formList}>
              <Input label="Tên địa điểm" placeholder="VD: Sân Bóng Green Park" value={form.name} onChange={set('name')} required />
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Giới thiệu</label>
                <textarea className={styles.textarea} rows={4} placeholder="Giới thiệu về địa điểm, cơ sở vật chất..." value={form.description} onChange={set('description')} />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Môn thể thao</label>
                <div className={styles.sportsGrid}>
                  {SPORTS.map(sport => (
                    <button key={sport.id} type="button" className={`${styles.sportChip} ${form.sports.includes(sport.id) ? styles.sportChipActive : ''}`} onClick={() => toggleSport(sport.id)}>
                      {sport.icon} {sport.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Thông tin vị trí</h2>
            <div className={styles.formList}>
              <Input label="Địa chỉ" placeholder="Số nhà, tên đường" value={form.street} onChange={set('street')} icon={<MapPin size={15} />} required />
              <div className={styles.formRow}>
                <Input label="Quận/Huyện" value={form.district} onChange={set('district')} required />
                <Input label="Thành phố" value={form.city} onChange={set('city')} required />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Giờ hoạt động</h2>
            <p className={styles.stepSub}>Giá và sân con sẽ được thiết lập riêng ở bước sau khi tạo địa điểm, trong mục "Quản lý sân" — địa điểm chỉ có thể nhận đặt sân sau khi có ít nhất 1 sân con.</p>
            <div className={styles.formRow}>
              <div className={styles.fieldGroup}><label className={styles.label}>Giờ mở cửa</label><input type="time" className={styles.timeInput} value={form.openTime} onChange={set('openTime')} /></div>
              <div className={styles.fieldGroup}><label className={styles.label}>Giờ đóng cửa</label><input type="time" className={styles.timeInput} value={form.closeTime} onChange={set('closeTime')} /></div>
            </div>
            <div className={styles.fieldGroup} style={{ marginTop: 'var(--space-5)' }}>
              <label className={styles.label}>Quy định của sân (không bắt buộc)</label>
              <textarea className={styles.textarea} rows={3} placeholder="VD: Không dùng giày đinh kim loại, tối đa 10 người..." value={form.rules} onChange={set('rules')} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Tiện ích & Cơ sở vật chất</h2>
            <div className={styles.amenitiesGrid}>
              {AMENITY_LIST.map(a => (
                <label key={a} className={`${styles.amenityCard} ${form.amenities.includes(a) ? styles.amenityActive : ''}`}>
                  <input type="checkbox" checked={form.amenities.includes(a)} onChange={() => toggleAmenity(a)} className={styles.checkbox} />
                  <span>{a}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Hình ảnh địa điểm</h2>
            <p className={styles.stepSub}>Tải lên ảnh chất lượng cao để thu hút khách hàng (tối thiểu 3 ảnh, tối đa 8 ảnh)</p>
            <div className={styles.uploadGrid}>
              {existingImages.map((img, i) => (
                <div key={`existing-${i}`} className={styles.uploadedSlot}>
                  <img src={getImageUrl(img)} alt="" className={styles.uploadedImg} />
                  <button type="button" className={styles.removeImgBtn} onClick={() => removeExistingImage(i)}><X size={13} /></button>
                </div>
              ))}
              {newImagePreviews.map((src, i) => (
                <div key={`new-${i}`} className={styles.uploadedSlot}>
                  <img src={src} alt="" className={styles.uploadedImg} />
                  <button type="button" className={styles.removeImgBtn} onClick={() => removeNewImage(i)}><X size={13} /></button>
                </div>
              ))}
              {totalImageCount < 8 && (
                <label className={styles.uploadSlot}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageSelect} style={{ display: 'none' }} />
                  <div className={styles.uploadIcon}><Camera size={22} /></div>
                  <span className={styles.uploadLabel}>Thêm ảnh</span>
                </label>
              )}
            </div>
            {totalImageCount < 3 && <p className={styles.uploadWarning}><AlertTriangle size={14} /> Nên có ít nhất 3 ảnh để tăng độ tin cậy với khách hàng</p>}
          </div>
        )}

        <div className={styles.navButtons}>
          {step > 1 && <Button variant="outline" icon={<ArrowLeft size={15} />} onClick={() => setStep(s => s - 1)}>Quay lại</Button>}
          <div style={{ flex: 1 }} />
          {step < STEPS.length ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && (!form.name || !form.sports.length)} iconRight={<ArrowRight size={15} />}>Tiếp theo</Button>
          ) : (
            <Button loading={loading} onClick={handleSubmit} variant="secondary" icon={editMode ? <Save size={15} /> : <Rocket size={15} />}>{editMode ? 'Lưu thay đổi' : 'Đăng địa điểm'}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
