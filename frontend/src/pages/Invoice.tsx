import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { api } from '../lib/api';
import { PAYMENT_LABEL, STATUS_META, sportMeta } from '../lib/constants';
import { formatDateLong, formatDuration, formatVnd } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { Button, ButtonLink, ErrorState, Spinner } from '../components/ui';

/**
 * Hoá đơn của một lượt đặt sân. Trang dùng màu cố định (nền trắng, chữ đen)
 * để bản in / PDF giống hệt nhau ở cả giao diện sáng lẫn tối.
 */
export default function Invoice() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useAsync((signal) => api.booking(id, signal), [id]);

  if (loading) {
    return (
      <div className="pt-32">
        <Spinner label="Đang tạo hoá đơn…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container-page pt-28">
        <ErrorState message={error ?? 'Không tìm thấy đặt sân'} onRetry={reload} />
        <div className="mt-6 text-center">
          <ButtonLink to="/bookings" variant="secondary">
            ← Quay lại lịch đặt
          </ButtonLink>
        </div>
      </div>
    );
  }

  const invoiceNo = `HD-${data.id.slice(-8).toUpperCase()}`;
  const unitPrice = data.duration ? Math.round(data.amount / data.duration) : data.amount;
  const discount = data.discountAmount ?? 0;
  const credit = data.creditApplied ?? 0;
  const serviceFee = data.serviceFee ?? 0;
  const total = data.amount + serviceFee - discount - credit;
  const cancelled = data.status === 'cancelled';
  const address = data.venueAddress
    ? [data.venueAddress.street, data.venueAddress.district, data.venueAddress.city].filter(Boolean).join(', ')
    : '';
  const sport = data.sport ? sportMeta(data.sport).label : '';

  const row = 'flex justify-between gap-6 py-1.5';

  return (
    <div className="container-page max-w-3xl pt-24 pb-8 lg:pt-28 print:max-w-none print:p-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/bookings" className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Lịch đặt của tôi
        </Link>
        <div className="text-right">
          <Button onClick={() => window.print()}>
            <Download className="size-4" /> Tải hoá đơn (PDF)
          </Button>
          <p className="mt-1.5 text-xs text-muted">Trong hộp thoại in, chọn "Lưu dưới dạng PDF".</p>
        </div>
      </div>

      <article className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 text-slate-900 shadow-lift sm:p-10 print:rounded-none print:border-0 print:shadow-none">
        {cancelled && (
          <span className="pointer-events-none absolute top-24 right-6 rotate-12 rounded-xl border-4 border-rose-500 px-4 py-1 text-2xl font-black tracking-widest text-rose-500 opacity-70">
            ĐÃ HUỶ
          </span>
        )}

        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-900 pb-6">
          <div>
            <p className="text-2xl font-black tracking-tight">
              E360<span className="text-emerald-600">Sport</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">Nền tảng đặt sân thể thao trực tuyến</p>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-black tracking-tight">HOÁ ĐƠN</h1>
            <p className="mt-1 font-mono text-sm font-bold">{invoiceNo}</p>
            <p className="text-sm text-slate-500">Ngày lập: {new Date(data.createdAt).toLocaleDateString('vi-VN')}</p>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase">Khách hàng</h2>
            <p className="mt-2 font-bold">{data.customer?.name ?? '—'}</p>
            <p className="text-sm text-slate-600">{data.customer?.email}</p>
            <p className="text-sm text-slate-600">{data.customer?.phone}</p>
          </div>
          <div className="sm:text-right">
            <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase">Địa điểm</h2>
            <p className="mt-2 font-bold">{data.venueName}</p>
            {address && <p className="text-sm text-slate-600">{address}</p>}
          </div>
        </section>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <th className="px-3 py-2.5 font-bold">Dịch vụ</th>
              <th className="px-3 py-2.5 text-right font-bold">Thời lượng</th>
              <th className="px-3 py-2.5 text-right font-bold">Đơn giá / giờ</th>
              <th className="px-3 py-2.5 text-right font-bold">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200 align-top">
              <td className="px-3 py-4">
                <p className="font-bold">
                  Thuê {data.courtName}
                  {sport && ` (${sport})`}
                </p>
                <p className="mt-1 text-slate-600">
                  {formatDateLong(data.date)} · {data.startTime} – {data.endTime}
                </p>
                {data.notes && <p className="mt-1 text-slate-500 italic">Ghi chú: {data.notes}</p>}
              </td>
              <td className="px-3 py-4 text-right whitespace-nowrap">{formatDuration(data.duration)}</td>
              <td className="px-3 py-4 text-right whitespace-nowrap">{formatVnd(unitPrice)}</td>
              <td className="px-3 py-4 text-right font-bold whitespace-nowrap">{formatVnd(data.amount)}</td>
            </tr>
          </tbody>
        </table>

        <section className="mt-6 ml-auto max-w-xs text-sm">
          <div className={row}>
            <span className="text-slate-600">Tạm tính</span>
            <span>{formatVnd(data.amount)}</span>
          </div>
          {serviceFee > 0 && (
            <div className={row}>
              <span className="text-slate-600">Phí dịch vụ</span>
              <span>{formatVnd(serviceFee)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className={row}>
              <span className="text-slate-600">Giảm giá</span>
              <span>−{formatVnd(discount)}</span>
            </div>
          )}
          {credit > 0 && (
            <div className={row}>
              <span className="text-slate-600">Dùng số dư</span>
              <span>−{formatVnd(credit)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between gap-6 border-t-2 border-slate-900 pt-3 text-lg font-black">
            <span>Tổng cộng</span>
            <span>{formatVnd(total)}</span>
          </div>
          {cancelled && (
            <>
              <div className={`${row} mt-2`}>
                <span className="text-slate-600">Phí huỷ</span>
                <span>{formatVnd(data.cancellationFee ?? 0)}</span>
              </div>
              <div className={`${row} font-bold text-emerald-700`}>
                <span>Hoàn lại</span>
                <span>{formatVnd(data.refundAmount ?? 0)}</span>
              </div>
            </>
          )}
        </section>

        <section className="mt-8 grid gap-4 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Trạng thái</p>
            <p className="mt-1 font-bold">{STATUS_META[data.status]?.label ?? data.status}</p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Thanh toán</p>
            <p className="mt-1 font-bold">{PAYMENT_LABEL[data.paymentMethod ?? ''] ?? data.paymentMethod ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Mã đặt sân</p>
            <p className="mt-1 font-mono text-xs font-bold break-all">{data.id}</p>
          </div>
        </section>

        {cancelled && data.cancellationReason && (
          <p className="mt-4 text-sm text-slate-600">
            <strong>Lý do huỷ:</strong> {data.cancellationReason}
          </p>
        )}

        <footer className="mt-10 border-t border-slate-200 pt-5 text-center text-xs text-slate-500">
          Cảm ơn bạn đã sử dụng E360Sport. Hoá đơn được tạo tự động và có giá trị tham khảo.
        </footer>
      </article>
    </div>
  );
}
