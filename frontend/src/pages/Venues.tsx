import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, MapPin, Search, SlidersHorizontal, Wallet, X } from 'lucide-react';
import { api } from '../lib/api';
import { CITIES, CITY_NAMES, SPORTS, sportMeta } from '../lib/constants';
import { addDays, cn, formatDateLong, timeToMinutes, toDateKey } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { PageHeader } from '../components/Layout';
import { Button, EmptyState, ErrorState, Pagination } from '../components/ui';
import { VenueCard, VenueCardSkeleton, VenueGrid } from '../components/VenueCard';

const PAGE_SIZE = 12;

/** Khoảng giá thuê mỗi giờ. `key` là giá trị lưu trên URL (`min-max`). */
const PRICE_RANGES: { key: string; label: string; min?: number; max?: number }[] = [
  { key: '0-100000', label: 'Dưới 100K', max: 100_000 },
  { key: '100000-200000', label: '100K – 200K', min: 100_000, max: 200_000 },
  { key: '200000-400000', label: '200K – 400K', min: 200_000, max: 400_000 },
  { key: '400000-', label: 'Trên 400K', min: 400_000 },
];

const DURATIONS = [
  { value: '60', label: '1 giờ' },
  { value: '90', label: '1,5 giờ' },
  { value: '120', label: '2 giờ' },
  { value: '180', label: '3 giờ' },
];

/** 05:00 → 22:30, cách nhau 30 phút. */
const START_TIMES = Array.from({ length: 36 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const addMinutes = (hhmm: string, minutes: number): string => {
  const total = timeToMinutes(hhmm) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export default function Venues() {
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const sport = params.get('sport') ?? '';
  const city = params.get('city') ?? '';
  const district = params.get('district') ?? '';
  const price = params.get('price') ?? '';
  const date = params.get('date') ?? '';
  const start = params.get('start') ?? '';
  const duration = params.get('dur') ?? '60';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const priceRange = PRICE_RANGES.find((r) => r.key === price);
  // Chỉ lọc giờ trống khi đã chọn đủ ngày + giờ bắt đầu, và giờ kết thúc không vượt quá nửa đêm.
  const end = date && start ? addMinutes(start, Number(duration)) : '';
  const timeFilter = end && timeToMinutes(end) <= 24 * 60 - 30 ? { date, startTime: start, endTime: end } : null;

  const [keyword, setKeyword] = useState(q);
  useEffect(() => setKeyword(q), [q]);

  /** Cập nhật bộ lọc trên URL; đổi bộ lọc thì quay về trang 1. */
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const { data, loading, error, reload } = useAsync(
    (signal) =>
      api.venues(
        {
          q,
          sport,
          city,
          district,
          minPrice: priceRange?.min,
          maxPrice: priceRange?.max,
          ...(timeFilter ?? {}),
          page,
          pageSize: PAGE_SIZE,
        },
        signal
      ),
    [q, sport, city, district, price, timeFilter?.date, timeFilter?.startTime, timeFilter?.endTime, page]
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update({ q: keyword.trim() });
  };

  type ActiveFilter = { key: string; label: string; clear: Record<string, string> };
  const candidates: (ActiveFilter | false | null | undefined | '')[] = [
    q && { key: 'q', label: `"${q}"`, clear: { q: '' } },
    sport && { key: 'sport', label: `${sportMeta(sport).emoji} ${sportMeta(sport).label}`, clear: { sport: '' } },
    city && { key: 'city', label: city, clear: { city: '', district: '' } },
    district && { key: 'district', label: district, clear: { district: '' } },
    priceRange && { key: 'price', label: `💰 ${priceRange.label}/giờ`, clear: { price: '' } },
    timeFilter && {
      key: 'time',
      label: `🕒 Trống ${timeFilter.startTime}–${timeFilter.endTime}, ${formatDateLong(timeFilter.date)}`,
      clear: { date: '', start: '', dur: '' },
    },
  ];
  const activeFilters = candidates.filter((f): f is ActiveFilter => !!f);

  const pageCount = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const today = toDateKey(new Date());
  const maxDate = toDateKey(addDays(new Date(), 13));
  const selectClass =
    'h-11 rounded-xl border border-line bg-surface px-3.5 text-sm font-semibold transition hover:border-brand-500/60 focus:border-brand-500 focus:outline-none disabled:opacity-50';

  // Mở sân từ kết quả lọc giờ trống → trang chi tiết chọn sẵn ngày/giờ đó.
  const detailSearch = timeFilter
    ? `?date=${timeFilter.date}&start=${timeFilter.startTime}&end=${timeFilter.endTime}`
    : '';

  return (
    <>
      <PageHeader
        eyebrow="Tìm sân"
        title={sport ? `Sân ${sportMeta(sport).label.toLowerCase()} ${sportMeta(sport).emoji}` : 'Khám phá tất cả sân'}
        description="Tìm theo tên sân hoặc địa chỉ — gõ không dấu vẫn ra kết quả."
      >
        <form onSubmit={submit} className="glass flex max-w-2xl items-center gap-2 rounded-2xl p-1.5">
          <label className="flex flex-1 items-center gap-3 px-3">
            <Search className="size-5 shrink-0 text-lime" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder='Ví dụ: "an phat", "tay son"…'
              className="h-11 w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/50"
              aria-label="Từ khoá tìm sân"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => {
                  setKeyword('');
                  update({ q: '' });
                }}
                className="rounded-lg p-1 text-white/60 hover:text-white"
                aria-label="Xoá từ khoá"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
          <button
            type="submit"
            className="h-11 shrink-0 rounded-xl bg-lime px-5 text-sm font-extrabold text-ink transition hover:brightness-105"
          >
            Tìm kiếm
          </button>
        </form>
      </PageHeader>

      {/* Thanh lọc dính dưới header */}
      <div className="sticky top-16 z-30 border-b border-line bg-bg/85 backdrop-blur-xl lg:top-[4.5rem]">
        <div className="container-page space-y-3 py-3">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <button
              type="button"
              onClick={() => update({ sport: '' })}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-sm font-bold transition',
                !sport ? 'bg-ink text-white dark:bg-lime dark:text-ink' : 'border border-line bg-surface hover:border-brand-500/60'
              )}
            >
              Tất cả
            </button>
            {SPORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => update({ sport: sport === s.key ? '' : s.key })}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-sm font-bold transition',
                  sport === s.key
                    ? 'bg-brand-gradient text-white shadow-glow'
                    : 'border border-line bg-surface hover:border-brand-500/60'
                )}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs font-bold text-muted lg:flex">
              <SlidersHorizontal className="size-4" /> Khu vực
            </span>
            <select
              value={city}
              onChange={(e) => update({ city: e.target.value, district: '' })}
              className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')}
              aria-label="Thành phố"
            >
              <option value="">Mọi thành phố</option>
              {CITY_NAMES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={district}
              onChange={(e) => update({ district: e.target.value })}
              disabled={!city}
              className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')}
              aria-label="Quận / huyện"
            >
              <option value="">{city ? 'Mọi quận' : 'Chọn thành phố trước'}</option>
              {(CITIES[city] ?? []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <span className="ml-2 hidden items-center gap-1.5 text-xs font-bold text-muted lg:flex">
              <Wallet className="size-4" /> Giá
            </span>
            <select
              value={price}
              onChange={(e) => update({ price: e.target.value })}
              className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')}
              aria-label="Khoảng giá mỗi giờ"
            >
              <option value="">Mọi mức giá</option>
              {PRICE_RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}/giờ
                </option>
              ))}
            </select>

            <span className="ml-2 hidden items-center gap-1.5 text-xs font-bold text-muted lg:flex">
              <CalendarClock className="size-4" /> Giờ trống
            </span>
            <input
              type="date"
              value={date}
              min={today}
              max={maxDate}
              onChange={(e) => update({ date: e.target.value, start: e.target.value ? start || '18:00' : '' })}
              className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')}
              aria-label="Ngày muốn chơi"
            />
            <select
              value={start}
              onChange={(e) => update({ start: e.target.value, date: e.target.value ? date || today : date })}
              className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')}
              aria-label="Giờ bắt đầu"
            >
              <option value="">Giờ bắt đầu</option>
              {START_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={duration}
              onChange={(e) => update({ dur: e.target.value })}
              disabled={!date || !start}
              className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')}
              aria-label="Thời lượng chơi"
            >
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <section className="container-page py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <p className="mr-2 flex items-center gap-2 text-sm text-muted">
            <MapPin className="size-4 text-brand-500" />
            {loading ? (
              'Đang tìm sân…'
            ) : (
              <>
                Tìm thấy <strong className="text-base text-fg">{data?.total ?? 0}</strong> sân
                {timeFilter && ' còn trống'}
              </>
            )}
          </p>
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => update(filter.clear)}
              className="flex items-center gap-1.5 rounded-full bg-brand-500/12 px-3 py-1 text-xs font-bold text-brand-700 transition hover:bg-brand-500/20 dark:text-brand-300"
            >
              {filter.label} <X className="size-3.5" />
            </button>
          ))}
          {activeFilters.length > 1 && (
            <button type="button" onClick={() => setParams({})} className="text-xs font-semibold text-muted underline">
              Xoá tất cả
            </button>
          )}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <VenueGrid>
            {Array.from({ length: 8 }, (_, i) => (
              <VenueCardSkeleton key={i} />
            ))}
          </VenueGrid>
        ) : !data?.items.length ? (
          <EmptyState
            emoji="🔍"
            title="Không tìm thấy sân phù hợp"
            description="Thử đổi từ khoá, bỏ bớt bộ lọc hoặc chọn khu vực, khung giờ khác xem sao."
            action={
              <Button variant="secondary" onClick={() => setParams({})}>
                Xoá bộ lọc
              </Button>
            }
          />
        ) : (
          <>
            <VenueGrid>
              {data.items.map((venue, index) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  index={index}
                  linkSearch={detailSearch}
                  matchLabel={
                    venue.matchingCourts != null
                      ? `${venue.matchingCourts} sân ${timeFilter ? 'còn trống' : 'đúng tầm giá'}`
                      : undefined
                  }
                />
              ))}
            </VenueGrid>
            <div className="mt-10">
              <Pagination
                page={page}
                pageCount={pageCount}
                onChange={(next) => {
                  update({ page: next > 1 ? String(next) : '' });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          </>
        )}
      </section>
    </>
  );
}
