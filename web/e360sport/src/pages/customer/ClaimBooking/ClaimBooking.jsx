import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Gift, Calendar, Clock, Trophy, ShieldCheck, Search } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Input from '@/components/ui/Input/Input'
import Spinner from '@/components/ui/Spinner/Spinner'
import { transferService } from '@/services/transferService'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate, formatTime } from '@/utils'
import styles from './ClaimBooking.module.css'

/**
 * Trang NHẬN SUẤT ĐẶT SÂN bằng mã sang tên.
 *
 * Người nhận nhập mã bạn bè gửi, xem trước suất mình sắp nhận, rồi xác nhận.
 * Nếu có phí sang tên thì phải thanh toán trước; hệ thống chỉ đổi người đứng
 * tên sau khi cổng báo thành công.
 */
export default function ClaimBooking() {
  const { code: codeFromUrl } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [code, setCode] = useState(codeFromUrl || '')
  const [looking, setLooking] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [data, setData] = useState(null)

  const lookup = async (value) => {
    const clean = String(value || '').trim().toUpperCase()
    if (!clean) return
    setLooking(true)
    setData(null)
    try {
      setData(await transferService.lookupAssignment(clean))
      setCode(clean)
    } catch (err) {
      toast.error(err?.message || 'Không tra được mã này')
    } finally {
      setLooking(false)
    }
  }

  // Cho phép chia sẻ đường dẫn kèm mã sẵn: /claim/ABCD2345
  useEffect(() => { if (codeFromUrl) lookup(codeFromUrl) }, [codeFromUrl])

  const handleClaim = async () => {
    setClaiming(true)
    try {
      const res = await transferService.claimAssignment(code)
      // Có phí sang tên: không còn cổng để redirect tới — chuyển sang trang
      // chi tiết yêu cầu, nơi hiển thị hướng dẫn chuyển khoản + mã QR.
      if (res.status === 'awaiting_payment') {
        navigate(`/transfers/${res.transfer._id}`)
        return
      }
      toast.success('Đã nhận suất thành công')
      navigate('/bookings')
    } catch (err) {
      toast.error(err?.message || 'Không thể nhận suất này')
      if ([409, 410].includes(err?.status)) setData(null)
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <Link to="/bookings" className={styles.back}><ArrowLeft size={15} /> Quay lại lịch sử đặt sân</Link>

        <div className={styles.header}>
          <h1 className={styles.title}>Nhận suất đặt sân</h1>
          <p className={styles.sub}>Nhập mã sang tên mà người chuyển đã gửi cho bạn</p>
        </div>

        <div className={styles.card}>
          <div className={styles.searchRow}>
            <Input
              placeholder="Nhập mã, ví dụ ABCD2345"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && lookup(code)}
              icon={<Gift size={15} />}
              className={styles.codeInput}
              maxLength={12}
            />
            <Button loading={looking} icon={<Search size={15} />} onClick={() => lookup(code)}>Tra mã</Button>
          </div>

          {looking && <div className={styles.loading}><Spinner /></div>}

          {data && (
            <div className={styles.preview}>
              <p className={styles.fromLine}>
                <strong>{data.transfer.fromCustomerName}</strong> muốn chuyển suất này cho bạn
              </p>

              <div className={styles.slotBox}>
                <p className={styles.venue}>{data.transfer.venueName}</p>
                <p className={styles.court}><Trophy size={13} /> {data.transfer.courtName}</p>
                <div className={styles.metaRow}>
                  <span><Calendar size={13} /> {formatDate(data.transfer.date)}</span>
                  <span><Clock size={13} /> {formatTime(data.transfer.startTime)} – {formatTime(data.transfer.endTime)}</span>
                </div>
              </div>

              <div className={styles.valueRow}>
                <span>Giá trị suất (đã được thanh toán)</span>
                <strong>{formatCurrency(data.value)}</strong>
              </div>
              <div className={styles.valueRow}>
                <span>Phí sang tên bạn cần trả</span>
                <strong className={styles.fee}>{data.fee > 0 ? formatCurrency(data.fee) : 'Miễn phí'}</strong>
              </div>

              <div className={styles.noteBox}>
                <ShieldCheck size={15} />
                <p>
                  Tiền sân bạn tự thanh toán với người chuyển — nền tảng không giữ hộ và không can thiệp.
                  Khoản phí sang tên ở trên bạn chuyển thẳng cho chủ sân.
                </p>
              </div>

              <p className={styles.expiry}>
                Mã hết hạn lúc {new Date(data.transfer.expiresAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </p>

              <Button fullWidth loading={claiming} onClick={handleClaim}>
                {data.fee > 0 ? `Thanh toán ${formatCurrency(data.fee)} và nhận suất` : 'Nhận suất này'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
