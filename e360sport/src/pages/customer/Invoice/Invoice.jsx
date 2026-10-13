import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Printer, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { bookingService } from '@/services/bookingService'
import { formatCurrency, formatDate, formatTime } from '@/utils'
import styles from './Invoice.module.css'

/**
 * HÓA ĐƠN của một lượt đặt đã xác nhận / hoàn tất.
 * "In / Lưu PDF" dùng hộp thoại in của trình duyệt (chọn "Lưu thành PDF") — nhờ vậy giữ đúng
 * tiếng Việt có dấu mà không cần thư viện tạo PDF phía máy chủ. CSS in chỉ giữ lại tờ hóa đơn.
 */
export default function Invoice() {
  const { bookingId } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    bookingService.getInvoice(bookingId)
      .then((res) => setInvoice(res.invoice))
      .catch((err) => setError(err?.message || 'Không thể tải hóa đơn'))
      .finally(() => setLoading(false))
  }, [bookingId])

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  if (error || !invoice) {
    return (
      <div className={styles.page}>
        <div className="container">
          <Link to="/bookings" className={styles.back}><ArrowLeft size={15} /> Quay lại lịch sử đặt sân</Link>
          <EmptyState icon={<AlertTriangle size={48} />} title="Không có hóa đơn" description={error || 'Không tìm thấy hóa đơn của lượt đặt này'} />
        </div>
      </div>
    )
  }

  const { seller, customer, service, lines, total, payment } = invoice

  return (
    <div className={styles.page}>
      <div className={`container ${styles.noPrint}`}>
        <div className={styles.toolbar}>
          <Link to="/bookings" className={styles.back}><ArrowLeft size={15} /> Quay lại lịch sử đặt sân</Link>
          <Button icon={<Printer size={15} />} onClick={() => window.print()}>In / Lưu PDF</Button>
        </div>
      </div>

      <article className={styles.sheet} id="invoice-sheet">
        <header className={styles.head}>
          <div>
            <p className={styles.brand}>{invoice.platform.name}</p>
            <h1 className={styles.title}>Hóa đơn thanh toán</h1>
          </div>
          <dl className={styles.meta}>
            <div><dt>Số hóa đơn</dt><dd>{invoice.invoiceNo}</dd></div>
            <div><dt>Ngày lập</dt><dd>{formatDate(invoice.issuedAt)}</dd></div>
          </dl>
        </header>

        <section className={styles.parties}>
          <div>
            <p className={styles.label}>Khách hàng</p>
            <p className={styles.strong}>{customer.name}</p>
            {customer.email && <p>{customer.email}</p>}
            {customer.phone && <p>{customer.phone}</p>}
          </div>
          <div>
            <p className={styles.label}>Đơn vị cung cấp dịch vụ</p>
            <p className={styles.strong}>{seller.venueName}</p>
            {seller.address && <p>{seller.address}</p>}
            {seller.ownerName && <p>Chủ sân: {seller.ownerName}</p>}
          </div>
        </section>

        <section className={styles.service}>
          <p className={styles.label}>Dịch vụ</p>
          <p className={styles.strong}>Thuê sân{service.sport ? ` ${service.sport}` : ''} — {service.courtName}</p>
          <p>{formatDate(service.date)} · {formatTime(service.startTime)}–{formatTime(service.endTime)} ({service.duration} giờ)</p>
        </section>

        <table className={styles.table}>
          <thead><tr><th>Khoản mục</th><th className={styles.right}>Thành tiền</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td className={`${styles.right} ${l.amount < 0 ? styles.negative : ''}`}>{l.amount < 0 ? `− ${formatCurrency(-l.amount)}` : formatCurrency(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Tổng thanh toán</td><td className={styles.right}>{formatCurrency(total)}</td></tr></tfoot>
        </table>

        <section className={styles.pay}>
          <p className={styles.label}>Thanh toán</p>
          <p>Hình thức: <strong>{payment.methodLabel}</strong></p>
          {payment.creditApplied > 0 && (
            <p>Trong đó trừ vào số dư khuyến mãi: <strong>{formatCurrency(payment.creditApplied)}</strong> · tiền thanh toán: <strong>{formatCurrency(payment.cashPaid)}</strong></p>
          )}
          {payment.reference && <p>Mã giao dịch: <strong>{payment.reference}</strong></p>}
        </section>

        <footer className={styles.foot}>
          Chứng từ điện tử xác nhận giao dịch đặt sân qua {invoice.platform.name}, không thay thế hóa đơn giá trị gia tăng.
          {invoice.platform.supportEmail && <> Cần hỗ trợ: {invoice.platform.supportEmail}.</>}
        </footer>
      </article>
    </div>
  )
}
