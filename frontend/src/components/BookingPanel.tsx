import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, Info, PartyPopper, ShieldCheck } from 'lucide-react';
import { api, ApiError, type BookingSummary, type Slot, type VenueDetail } from '../lib/api';
import { sportMeta } from '../lib/constants';
import {
  addDays,
  cn,
  formatDateLong,
  formatDuration,
  formatVnd,
  timeToMinutes,
  toDateKey,
  weekdayShort,
} from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, ButtonLink, Modal, Skeleton } from './ui';

const DAYS_AHEAD = 14;

const PERIODS: { label: string; emoji: string; from: number; to: number }[] = [
  { label: 'Sáng', emoji: '🌤️', from: 0, to: 12 * 60 },
  { label: 'Chiều', emoji: '☀️', from: 12 * 60, to: 18 * 60 },
  { label: 'Tối', emoji: '🌙', from: 18 * 60, to: 24 * 60 },
];

interface Range {
  start: number;
  end: number;
}

export default function BookingPanel({ venue }: { venue: VenueDetail }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  }, []);

  const [courtId, setCourtId] = useState(venue.courts[0]?.id ?? '');
  // Mở từ kết quả lọc giờ trống: ?date=&start=&end= → chọn sẵn ngày và khung giờ đó.
  const [searchParams] = useSearchParams();
  const wanted = useRef({
    date: searchParams.get('date') ?? '',
    start: searchParams.get('start') ?? '',
    end: searchParams.get('end') ?? '',
  });

  const [date, setDate] = useState(() => {
    const keys = days.map(toDateKey);
    return keys.includes(wanted.current.date) ? wanted.current.date : keys[0];
  });
  const [range, setRange] = useState<Range | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<BookingSummary | null>(null);

  const court = venue.courts.find((c) => c.id === courtId);

  const availability = useAsync(
    (signal) => api.availability(venue.id, courtId, date, signal),
    [venue.id, courtId, date],
    !!courtId
  );

  // Đổi sân hoặc ngày → bỏ khung giờ đang chọn.
  useEffect(() => setRange(null), [courtId, date]);

  const isToday = date === toDateKey(new Date());
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  /** Slot đặt được: còn trống và chưa trôi qua (nếu là hôm nay). */
  const slots = useMemo(
    () =>
      (availability.data?.slots ?? []).map((slot: Slot) => ({
        ...slot,
        past: isToday && timeToMinutes(slot.start) <= nowMinutes,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availability.data, isToday]
  );

  // Chọn sẵn khung giờ được yêu cầu (một lần, khi lịch của đúng ngày đó tải xong).
  useEffect(() => {
    const { date: wantedDate, start, end } = wanted.current;
    if (!start || !end || wantedDate !== date || !slots.length) return;
    wanted.current = { date: '', start: '', end: '' };
    const from = slots.findIndex((s) => s.start === start);
    const to = slots.findIndex((s) => s.end === end);
    if (from < 0 || to < from) return;
    if (slots.slice(from, to + 1).every((s) => s.available && !s.past)) setRange({ start: from, end: to });
  }, [slots, date]);

  const bookable = (index: number): boolean => !!slots[index] && slots[index].available && !slots[index].past;

  const pick = (index: number) => {
    if (!bookable(index)) return;

    // Đang chọn 1 slot → bấm slot phía sau để kéo dài (nếu các slot giữa đều trống).
    if (range && range.start === range.end && index > range.start) {
      for (let i = range.start; i <= index; i += 1) {
        if (!bookable(i)) {
          toast.info('Khoảng giờ này có slot đã được đặt — hãy chọn khoảng liền nhau còn trống.');
          setRange({ start: index, end: index });
          return;
        }
      }
      setRange({ start: range.start, end: index });
      return;
    }

    if (range && range.start === index && range.end === index) {
      setRange(null);
      return;
    }

    setRange({ start: index, end: index });
  };

  const selection = range && slots[range.start] && slots[range.end]
    ? {
        startTime: slots[range.start].start,
        endTime: slots[range.end].end,
        hours: (range.end - range.start + 1) / 2,
      }
    : null;

  const amount = selection && court ? Math.round(court.pricePerHour * selection.hours) : 0;
  const freeCount = slots.filter((s) => s.available && !s.past).length;

  const submit = async () => {
    if (!selection || !court) return;
    if (!user) {
      toast.info('Vui lòng đăng nhập để đặt sân');
      navigate('/login', { state: { from: location.pathname } });
      return;
    }

    setSubmitting(true);
    try {
      const booking = await api.createBooking({
        courtId: court.id,
        date,
        startTime: selection.startTime,
        endTime: selection.endTime,
        notes: notes.trim() || undefined,
      });
      setSuccess(booking);
      setNotes('');
      setRange(null);
      availability.reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.friendly : 'Đặt sân thất bại, vui lòng thử lại');
      // 409 = vừa có người khác đặt mất → nạp lại lịch.
      if (error instanceof ApiError && error.status === 409) {
        setRange(null);
        availability.reload();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!venue.courts.length) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-6 text-center shadow-card">
        <p className="text-4xl">🚧</p>
        <p className="mt-3 font-bold">Sân chưa mở đặt lịch</p>
        <p className="mt-1 text-sm text-muted">Địa điểm này chưa có sân con nào đang hoạt động.</p>
      </div>
    );
  }

  return (
    <div id="dat-san" className="scroll-mt-28 overflow-hidden rounded-3xl border border-line bg-surface shadow-lift">
      <div className="relative overflow-hidden bg-ink px-6 py-5 text-white">
        <div className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-brand-500/40 blur-3xl" />
        <p className="relative text-xs font-bold tracking-widest text-lime uppercase">Đặt sân trực tuyến</p>
        <p className="relative mt-1 flex items-baseline gap-1.5">
          <span className="text-3xl font-black">{court ? formatVnd(court.pricePerHour) : '—'}</span>
          <span className="text-sm text-white/60">/ giờ</span>
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {/* 1. Chọn sân con */}
        <div>
          <p className="mb-2.5 flex items-center gap-2 text-sm font-bold">
            <span className="flex size-6 items-center justify-center rounded-full bg-brand-gradient text-xs text-white">1</span>
            Chọn sân
          </p>
          <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
            {venue.courts.map((c) => {
              const active = c.id === courtId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCourtId(c.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left transition',
                    active
                      ? 'border-brand-500 bg-brand-500/[0.07]'
                      : 'border-line hover:border-brand-500/40 hover:bg-surface-2'
                  )}
                >
                  <span className="text-2xl">{sportMeta(c.type).emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{c.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {[c.size, c.surface].filter(Boolean).join(' · ') || sportMeta(c.type).label}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold text-brand-600 dark:text-brand-400">
                    {formatVnd(c.pricePerHour)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Chọn ngày */}
        <div>
          <p className="mb-2.5 flex items-center gap-2 text-sm font-bold">
            <span className="flex size-6 items-center justify-center rounded-full bg-brand-gradient text-xs text-white">2</span>
            Chọn ngày
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-muted">
              <CalendarDays className="size-3.5" /> {formatDateLong(date)}
            </span>
          </p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((day, index) => {
              const key = toDateKey(day);
              const active = key === date;
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDate(key)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-14 shrink-0 flex-col items-center rounded-2xl border-2 py-2 transition',
                    active
                      ? 'border-brand-500 bg-brand-gradient text-white shadow-glow'
                      : 'border-line hover:border-brand-500/40 hover:bg-surface-2'
                  )}
                >
                  <span className={cn('text-[11px] font-semibold', active ? 'text-white/85' : weekend ? 'text-rose-500' : 'text-muted')}>
                    {index === 0 ? 'H.nay' : weekdayShort(day)}
                  </span>
                  <span className="text-lg leading-tight font-black">{day.getDate()}</span>
                  <span className={cn('text-[10px] font-medium', active ? 'text-white/75' : 'text-muted')}>
                    Th{day.getMonth() + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Chọn giờ */}
        <div>
          <p className="mb-2.5 flex items-center gap-2 text-sm font-bold">
            <span className="flex size-6 items-center justify-center rounded-full bg-brand-gradient text-xs text-white">3</span>
            Chọn khung giờ
            {!availability.loading && !availability.error && (
              <span className="ml-auto text-xs font-medium text-muted">Còn {freeCount} slot trống</span>
            )}
          </p>

          {availability.loading ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 16 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : availability.error ? (
            <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-300">
              {availability.error}{' '}
              <button type="button" onClick={availability.reload} className="font-bold underline">
                Thử lại
              </button>
            </div>
          ) : freeCount === 0 ? (
            <div className="rounded-2xl bg-surface-2 p-5 text-center text-sm text-muted">
              😢 Ngày này đã kín lịch. Hãy thử ngày khác hoặc sân khác nhé.
            </div>
          ) : (
            <div className="space-y-3.5">
              {PERIODS.map((period) => {
                const items = slots
                  .map((slot, index) => ({ slot, index }))
                  .filter(({ slot }) => {
                    const m = timeToMinutes(slot.start);
                    return m >= period.from && m < period.to;
                  });
                if (!items.length) return null;

                return (
                  <div key={period.label}>
                    <p className="mb-1.5 text-xs font-bold text-muted">
                      {period.emoji} {period.label}
                    </p>
                    <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                      {items.map(({ slot, index }) => {
                        const selected = !!range && index >= range.start && index <= range.end;
                        const disabled = !slot.available || slot.past;
                        return (
                          <button
                            key={slot.start}
                            type="button"
                            disabled={disabled}
                            onClick={() => pick(index)}
                            aria-pressed={selected}
                            title={!slot.available ? 'Đã có người đặt' : slot.past ? 'Đã qua giờ' : `${slot.start} – ${slot.end}`}
                            className={cn(
                              'h-10 rounded-xl text-sm font-bold tabular-nums transition-all duration-150',
                              selected && 'scale-[1.04] bg-brand-gradient text-white shadow-glow',
                              !selected && !disabled && 'border border-line bg-surface hover:border-brand-500 hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-brand-300',
                              !slot.available && 'bg-surface-2 text-muted/50 line-through',
                              slot.available && slot.past && 'bg-surface-2/60 text-muted/40'
                            )}
                          >
                            {slot.start}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] font-medium text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded border border-line bg-surface" /> Còn trống
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded bg-brand-gradient" /> Đang chọn
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded bg-surface-2" /> Đã đặt / đã qua
                </span>
              </div>
            </div>
          )}

          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-brand-500/[0.07] px-3 py-2 text-xs leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
            Bấm giờ bắt đầu, rồi bấm một giờ muộn hơn để kéo dài thời gian chơi. Mỗi ô là 30 phút.
          </p>
        </div>

        {/* Tóm tắt + xác nhận */}
        {selection && court && (
          <div className="animate-pop space-y-3 rounded-2xl border border-brand-500/30 bg-brand-500/[0.06] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted">
                <Clock className="size-4" /> Thời gian
              </span>
              <span className="font-bold tabular-nums">
                {selection.startTime} – {selection.endTime}
                <span className="ml-1.5 font-medium text-muted">({formatDuration(selection.hours)})</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Đơn giá</span>
              <span className="font-semibold">{formatVnd(court.pricePerHour)} × {selection.hours} giờ</span>
            </div>
            <div className="flex items-center justify-between border-t border-brand-500/20 pt-3">
              <span className="font-bold">Tổng cộng</span>
              <span className="text-2xl font-black text-brand-600 dark:text-brand-400">{formatVnd(amount)}</span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ghi chú cho chủ sân (không bắt buộc)…"
              className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm transition placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
            />
          </div>
        )}

        <Button size="lg" className="w-full" disabled={!selection} loading={submitting} onClick={submit}>
          {!selection ? 'Chọn khung giờ để tiếp tục' : user ? `Xác nhận đặt sân · ${formatVnd(amount)}` : 'Đăng nhập để đặt sân'}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="size-4 text-brand-500" /> Giữ chỗ tức thì · Không lo trùng lịch
        </p>
      </div>

      {/* Đặt thành công */}
      <Modal
        open={!!success}
        onClose={() => setSuccess(null)}
        title={
          <span className="flex items-center gap-2">
            <PartyPopper className="size-5 text-brand-500" /> Đặt sân thành công!
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setSuccess(null)}>
              Đặt thêm
            </Button>
            <ButtonLink to="/bookings">Xem lịch đặt của tôi</ButtonLink>
          </>
        }
      >
        {success && (
          <div className="text-center">
            <span className="mx-auto flex size-20 animate-pop items-center justify-center rounded-full bg-brand-500/15">
              <CheckCircle2 className="size-11 text-brand-500" />
            </span>
            <p className="mt-4 text-muted">Chỗ của bạn đã được giữ. Hẹn gặp bạn trên sân! 🎉</p>
            <dl className="mt-5 space-y-2.5 rounded-2xl bg-surface-2 p-4 text-left text-sm">
              {[
                ['Địa điểm', success.venueName],
                ['Sân', success.courtName],
                ['Ngày', formatDateLong(success.date)],
                ['Giờ', `${success.startTime} – ${success.endTime}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-bold">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-line pt-2.5">
                <dt className="font-bold">Thanh toán</dt>
                <dd className="text-lg font-black text-brand-600 dark:text-brand-400">{formatVnd(success.amount)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              Xem lại hoặc huỷ lịch tại <Link to="/bookings" className="font-semibold text-brand-600 underline dark:text-brand-400">Lịch đặt của tôi</Link>.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
