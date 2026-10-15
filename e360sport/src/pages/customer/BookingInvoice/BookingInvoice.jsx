import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import { bookingService } from '@/services/bookingService'
import { formatCurrency, formatDate } from '@/utils'
import styles from './BookingInvoice.module.css'

const PAYMENT_METHOD = {
  bank_transfer: 'Chuyển khoản ngân hàng',
  credit: 'Số dư khuyến mãi',
  manual: 'Thanh toán tại sân',
}

function InvoiceRow({ label, value, negative = false, total = false }) {
  return (
    <div className={`${styles.row} ${negative ? styles.negative : ''} ${total ? styles.total : ''}`}>
      <span>{label}</span><strong>{value}</strong>
    </div>
  )
}

export default function BookingInvoice() {
  const { bookingId } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    bookingService.getInvoice(bookingId)
      .then((result) => setInvoice(result.invoice))
      .catch((err) => setError(err?.message || 'Không thể tải hóa đơn'))
  }, [bookingId])

  if (error) {
    return <main className={styles.page}><div className={styles.error}>{error}<Link to="/bookings">Quay lại lịch sử đặt sân</Link></div></main>
  }
  if (!invoice) return <main className={styles.loading}><Spinner size="lg" /></main>

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <Link to="/bookings"><Button variant="ghost" icon={<ArrowLeft size={16} />}>Lịch sử đặt sân</Button></Link>
        <Button icon={<Printer size={16} />} onClick={() => window.print()}>In / lưu PDF</Button>
      </div>
      <article className={styles.invoice}>
        <header className={styles.header}>
          <div><p className={styles.brand}>ESPORT360</p><h1>Hóa đơn đặt sân</h1></div>
          <div className={styles.code}><span>Mã hóa đơn</span><strong>{invoice.code}</strong><span>{formatDate(invoice.issuedAt, 'dd/MM/yyyy')}</span></div>
        </header>

        <section className={styles.parties}>
          <div><span>Khách hàng</span><strong>{invoice.customerName}</strong><p>{invoice.customerEmail}</p></div>
          <div><span>Địa điểm</span><strong>{invoice.venueName}</strong><p>{invoice.courtName}</p></div>
        </section>

        <section className={styles.booking}>
          <div><span>Ngày sử dụng</span><strong>{formatDate(invoice.date)}</strong></div>
          <div><span>Khung giờ</span><strong>{invoice.startTime} – {invoice.endTime}</strong></div>
          <div><span>Môn thể thao</span><strong>{invoice.sport || 'Đặt sân'}</strong></div>
        </section>

        <section className={styles.amounts}>
          <InvoiceRow label="Tiền sân" value={formatCurrency(invoice.amount)} />
          {invoice.serviceFee > 0 && <InvoiceRow label="Phí dịch vụ" value={formatCurrency(invoice.serviceFee)} />}
          {invoice.discountAmount > 0 && <InvoiceRow label="Giảm giá" value={`−${formatCurrency(invoice.discountAmount)}`} negative />}
          <InvoiceRow label="Tổng cộng" value={formatCurrency(invoice.total)} total />
          {invoice.creditApplied > 0 && <InvoiceRow label="Đã thanh toán bằng số dư" value={`−${formatCurrency(invoice.creditApplied)}`} negative />}
          <InvoiceRow label="Phương thức thanh toán" value={PAYMENT_METHOD[invoice.paymentMethod] || invoice.paymentMethod} />
        </section>

        <footer className={styles.footer}>Chứng từ xác nhận thanh toán dịch vụ đặt sân, không thay thế hóa đơn VAT.</footer>
      </article>
    </main>
  )
}