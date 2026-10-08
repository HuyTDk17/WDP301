import { useState } from 'react';
import { CalendarX2, Clock, FileText, MapPin, ReceiptText, Repeat2 } from 'lucide-react';
import { api, ApiError, type BookingStatus, type BookingSummary } from '../lib/api';
import { PAYMENT_LABEL, STATUS_META, sportMeta } from '../lib/constants';
import { cn, formatDateLong, formatDuration, formatVnd, fromDateKey, weekdayShort } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/Layout';
import CancellationPolicyTable from '../components/CancellationPolicyTable';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Modal, Pagination, Skeleton, Spinner } from '../components/ui';

const PAGE_SIZE = 8;

const TABS: { key: BookingStatus | ''; label: string }[] = [
  { key: '', label: 'Tất cả' },
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'awaiting_payment', label: 'Chờ thanh toán' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã huỷ' },
  { key: 'no_show', label: 'Vắng mặt' },
];

const CANCELLABLE: BookingStatus[] = ['confirmed', 'awaiting_payment'];

function StatusBadge({ status }: { status: BookingStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.confirmed;
  return (
    <Badge className={meta.className}>
      <span className={cn('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </Badge>
  );
}

function BookingCard({
  booking,
  index,
  onDetail,
  onCancel,
}: {
  booking: BookingSummary;
  index: number;
  onDetail: () => void;
  onCancel: () => void;
}) {
  const date = fromDateKey(booking.date);
  const faded = booking.status === 'cancelled' || booking.status === 'no_show';

  return (
    <article
      className="group flex animate-fade-up flex-col gap-4 rounded-3xl border border-line bg-surface p-4 shadow-card transition-all duration-300 hover:border-brand-500/40 hover:shadow-lift sm:flex-row sm:items-center sm:p-5"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-white sm:w-24 sm:flex-col sm:gap-0 sm:py-4 sm:text-center',
          faded ? 'bg-slate-500' : 'bg-brand-gradient'
        )}
      >
        <span className="text-xs font-bold uppercase opacity-85">{weekdayShort(date)}</span>
        <span className="text-3xl leading-none font-black sm:my-1">{date.getDate()}</span>
        <span className="text-xs font-semibold opacity-85">
          Tháng {date.getMonth() + 1}
          <span className="sm:hidden">, {date.getFullYear()}</span>
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          {!!booking.transferCount && (
            <Badge className="bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300">
              <Repeat2 className="size-3" /> Đã chuyển sân {booking.transferCount} lần
            </Badge>
          )}
        </div>
        <h3 className={cn('mt-2 truncate text-lg font-extrabold', faded && 'text-muted line-through decoration-1')}>
          {booking.venueName}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4 text-brand-500" /> {booking.courtName}
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <Clock className="size-4 text-brand-500" /> {booking.startTime} – {booking.endTime}
          </span>
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-line pt-4 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
        <p className="text-xl font-black text-brand-600 dark:text-brand-400">{formatVnd(booking.amount)}</p>
        <div className="flex gap-2">
          <ButtonLink to={`/bookings/${booking.id}/invoice`} variant="ghost" size="sm" aria-label="Xem hoá đơn">
            <FileText className="size-4" /> Hoá đơn
          </ButtonLink>
          <Button variant="secondary" size="sm" onClick={onDetail}>
            Chi tiết
          </Button>
          {CANCELLABLE.includes(booking.status) && (
            <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-500/10 dark:text-rose-400" onClick={onCancel}>
              Huỷ lịch
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function BookingDetailModal({ id, onClose, onCancel }: { id: string | null; onClose: () => void; onCancel: (id: string) => void }) {
  const { data, loading, error } = useAsync((signal) => api.booking(id ?? '', signal), [id], !!id);

  const rows: [string, React.ReactNode][] = data
    ? [
        ['Địa điểm', data.venueName],
        ['Sân', data.courtName],
        ['Môn', data.sport ? `${sportMeta(data.sport).emoji} ${sportMeta(data.sport).label}` : '—'],
        ['Ngày chơi', formatDateLong(data.date)],
        ['Khung giờ', `${data.startTime} – ${data.endTime} (${formatDuration(data.duration)})`],
        ['Thanh toán', PAYMENT_LABEL[data.paymentMethod ?? ''] ?? data.paymentMethod ?? '—'],
        ['Đặt lúc', new Date(data.createdAt).toLocaleString('vi-VN')],
      ]
    : [];

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ReceiptText className="size-5 text-brand-500" /> Chi tiết đặt sân
        </span>
      }
      footer={
        data && (
          <>
            {CANCELLABLE.includes(data.status) && (
              <Button variant="ghost" className="text-rose-600 hover:bg-rose-500/10 dark:text-rose-400" onClick={() => onCancel(data.id)}>
                Huỷ lịch này
              </Button>
            )}
            <ButtonLink to={`/bookings/${data.id}/invoice`} variant="secondary">
              <FileText className="size-4" /> Xem hoá đơn
            </ButtonLink>
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
          </>
        )
      }
    >
      {loading ? (
        <Spinner />
      ) : error || !data ? (
        <p className="py-8 text-center text-sm text-rose-500">{error ?? 'Không tìm thấy đặt sân'}</p>
      ) : (
        <div>
          <div className="flex items-center justify-between rounded-2xl bg-ink p-5 text-white">
            <div>
              <p className="text-xs text-white/60">Tổng thanh toán</p>
              <p className="text-3xl font-black">{formatVnd(data.amount)}</p>
            </div>
            <StatusBadge status={data.status} />
          </div>

          <dl className="mt-4 divide-y divide-line text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-6 py-3">
                <dt className="shrink-0 text-muted">{label}</dt>
                <dd className="text-right font-semibold">{value}</dd>
              </div>
            ))}
            {!!data.serviceFee && (
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-muted">Phí dịch vụ</dt>
                <dd className="font-semibold">{formatVnd(data.serviceFee)}</dd>
              </div>
            )}
            {!!data.refundAmount && (
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-muted">Hoàn tiền</dt>
                <dd className="font-semibold text-brand-600 dark:text-brand-400">{formatVnd(data.refundAmount)}</dd>
              </div>
            )}
            {!!data.cancellationFee && (
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-muted">Phí huỷ</dt>
                <dd className="font-semibold text-rose-600 dark:text-rose-400">{formatVnd(data.cancellationFee)}</dd>
              </div>
            )}
          </dl>

          {data.status === 'cancelled' && data.cancellationReason && (
            <p className="mt-3 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
              <strong>Lý do huỷ:</strong> {data.cancellationReason}
            </p>
          )}
          <p className="mt-4 text-center text-xs text-muted">Mã đặt sân: {data.id}</p>
        </div>
      )}
    </Modal>
  );
}

export default function Bookings() {
  const toast = useToast();
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingSummary | null>(null);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const { data, loading, error, reload } = useAsync(
    (signal) => api.bookings({ status: status || undefined, page, pageSize: PAGE_SIZE }, signal),
    [status, page]
  );

  // Số tiền hoàn / phí huỷ nếu huỷ ngay lúc này.
  const quote = useAsync(
    (signal) => api.cancellationQuote(cancelTarget?.id ?? '', signal),
    [cancelTarget?.id],
    !!cancelTarget
  );

  const askCancel = (booking: BookingSummary) => {
    setReason('');
    setCancelTarget(booking);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const trimmed = reason.trim();
    if (trimmed.length === 1) {
      toast.info('Lý do huỷ cần ít nhất 2 ký tự (hoặc để trống)');
      return;
    }
    setCancelling(true);
    try {
      const result = await api.cancelBooking(cancelTarget.id, trimmed || undefined);
      toast.success(
        result.refundAmount > 0
          ? `Đã huỷ lịch. Bạn được hoàn ${formatVnd(result.refundAmount)}`
          : 'Đã huỷ lịch đặt sân'
      );
      setCancelTarget(null);
      setDetailId(null);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.friendly : 'Không huỷ được lịch, vui lòng thử lại');
    } finally {
      setCancelling(false);
    }
  };

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Tài khoản"
        title="Lịch đặt của tôi"
        description="Theo dõi các lần đặt sân, xem chi tiết và huỷ lịch khi cần."
      />

      <section className="container-page py-8">
        <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key || 'all'}
              type="button"
              role="tab"
              aria-selected={status === tab.key}
              onClick={() => {
                setStatus(tab.key);
                setPage(1);
              }}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-sm font-bold transition',
                status === tab.key
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'border border-line bg-surface hover:border-brand-500/60'
              )}
            >
              {tab.label}
              {status === tab.key && data && <span className="ml-1.5 opacity-80">({data.total})</span>}
            </button>
          ))}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-3xl" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            emoji="📅"
            title={status ? 'Không có lịch nào ở trạng thái này' : 'Bạn chưa đặt sân nào'}
            description="Chọn một sân ưng ý, chọn khung giờ trống và giữ chỗ chỉ trong vài chạm."
            action={<ButtonLink to="/venues">Tìm sân ngay</ButtonLink>}
          />
        ) : (
          <>
            <div className={cn('space-y-4 transition-opacity', loading && 'opacity-50')}>
              {items.map((booking, index) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  index={index}
                  onDetail={() => setDetailId(booking.id)}
                  onCancel={() => askCancel(booking)}
                />
              ))}
            </div>
            <div className="mt-8">
              <Pagination
                page={page}
                pageCount={Math.ceil((data?.total ?? 0) / PAGE_SIZE)}
                onChange={(next) => {
                  setPage(next);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          </>
        )}
      </section>

      <BookingDetailModal
        id={detailId}
        onClose={() => setDetailId(null)}
        onCancel={(id) => {
          const target = items.find((b) => b.id === id);
          if (target) askCancel(target);
        }}
      />

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={
          <span className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <CalendarX2 className="size-5" /> Huỷ lịch đặt sân?
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Giữ lịch
            </Button>
            <Button variant="danger" loading={cancelling} disabled={!quote.data?.cancellable} onClick={confirmCancel}>
              Xác nhận huỷ
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface-2 p-4 text-sm">
              <p className="font-bold">{cancelTarget.venueName}</p>
              <p className="mt-1 text-muted">
                {cancelTarget.courtName} · {formatDateLong(cancelTarget.date)} · {cancelTarget.startTime} – {cancelTarget.endTime}
              </p>
            </div>
            {quote.loading ? (
              <Skeleton className="h-24 rounded-2xl" />
            ) : quote.error || !quote.data ? (
              <p className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-300">
                {quote.error ?? 'Không tính được số tiền hoàn'}
              </p>
            ) : !quote.data.cancellable ? (
              <p className="rounded-2xl bg-rose-500/10 p-4 text-sm font-semibold text-rose-600 dark:text-rose-300">
                {quote.data.reason}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-brand-500/10 p-4">
                    <p className="text-xs font-semibold text-muted">Bạn được hoàn</p>
                    <p className="mt-1 text-xl font-black text-brand-600 dark:text-brand-400">
                      {formatVnd(quote.data.refundAmount)}
                    </p>
                    <p className="text-xs text-muted">{Math.round(quote.data.refundRate * 100)}% tiền sân</p>
                  </div>
                  <div className="rounded-2xl bg-rose-500/10 p-4">
                    <p className="text-xs font-semibold text-muted">Phí huỷ</p>
                    <p className="mt-1 text-xl font-black text-rose-600 dark:text-rose-400">
                      {formatVnd(quote.data.cancellationFee)}
                    </p>
                    <p className="text-xs text-muted">Còn {formatDuration(Math.max(0, quote.data.leadHours))} tới giờ chơi</p>
                  </div>
                </div>
                {cancelTarget.status === 'confirmed' && (
                  <CancellationPolicyTable tiers={quote.data.tiers} activeRate={quote.data.refundRate} />
                )}
              </>
            )}
            <p className="text-sm text-muted">
              Sau khi huỷ, khung giờ sẽ được mở lại cho người khác đặt. Thao tác này không hoàn tác được.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Lý do huỷ (không bắt buộc)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ví dụ: Bận việc đột xuất, đội không đủ người…"
                className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm transition placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
              />
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
