import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Clock, Heart, MapPin, ScrollText, Share2, Star } from 'lucide-react';
import { api } from '../lib/api';
import { AMENITY_EMOJI, sportMeta } from '../lib/constants';
import { cn, formatVnd } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import BookingPanel from '../components/BookingPanel';
import Reviews from '../components/Reviews';
import CancellationPolicyTable from '../components/CancellationPolicyTable';
import { Button, ButtonLink, ErrorState, Skeleton, SmartImage } from '../components/ui';

function Gallery({ images, name, fallback }: { images: string[]; name: string; fallback: string }) {
  const [active, setActive] = useState(0);
  const list = images.length ? images : [''];

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_11rem]">
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-surface-2 shadow-card lg:aspect-auto lg:h-[28rem]">
        <SmartImage key={list[active]} src={list[active]} alt={name} fallback={fallback} eager className="size-full animate-fade-in" />
        <span className="absolute right-4 bottom-4 rounded-full bg-ink/70 px-3 py-1 text-xs font-bold text-white backdrop-blur">
          {active + 1} / {list.length}
        </span>
      </div>
      {list.length > 1 && (
        <div className="no-scrollbar flex gap-3 overflow-x-auto lg:flex-col lg:overflow-visible">
          {list.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Xem ảnh ${index + 1}`}
              aria-pressed={index === active}
              className={cn(
                'relative h-20 w-28 shrink-0 overflow-hidden rounded-2xl transition lg:h-auto lg:w-full lg:flex-1',
                index === active ? 'ring-3 ring-brand-500 ring-offset-2 ring-offset-bg' : 'opacity-70 hover:opacity-100'
              )}
            >
              <SmartImage src={src} alt="" fallback={fallback} className="size-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="container-page pt-24 lg:pt-28">
      <Skeleton className="h-5 w-64" />
      <Skeleton className="mt-5 h-72 rounded-3xl lg:h-[28rem]" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_26rem]">
        <div className="space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    </div>
  );
}

export default function VenueDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { isFavorite, toggle } = useFavorites();
  const { data: venue, loading, error, reload } = useAsync((signal) => api.venue(id, signal), [id]);

  if (loading && !venue) return <DetailSkeleton />;

  if (error || !venue) {
    return (
      <div className="container-page pt-28">
        <ErrorState message={error ?? 'Không tìm thấy sân'} onRetry={reload} />
        <div className="mt-6 text-center">
          <ButtonLink to="/venues" variant="secondary">
            ← Quay lại danh sách sân
          </ButtonLink>
        </div>
      </div>
    );
  }

  const favorite = isFavorite(venue.id);
  const primary = sportMeta(venue.sports[0] ?? '');
  const fullAddress = `${venue.address.street}, ${venue.address.district}, ${venue.address.city}`;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Đã sao chép liên kết sân');
    } catch {
      toast.error('Trình duyệt không cho phép sao chép');
    }
  };

  return (
    <div className="container-page pt-24 pb-24 lg:pt-28 lg:pb-0">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted" aria-label="Đường dẫn">
        <Link to="/" className="hover:text-fg">Trang chủ</Link>
        <ChevronRight className="size-4" />
        <Link to="/venues" className="hover:text-fg">Tìm sân</Link>
        <ChevronRight className="size-4" />
        <Link to={`/venues?city=${encodeURIComponent(venue.address.city)}`} className="hover:text-fg">
          {venue.address.city}
        </Link>
        <ChevronRight className="size-4" />
        <span className="line-clamp-1 font-semibold text-fg">{venue.name}</span>
      </nav>

      <div className="mt-5">
        <Gallery images={venue.images} name={venue.name} fallback={primary.emoji} />
      </div>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1fr_26rem]">
        {/* Cột thông tin */}
        <div className="min-w-0 space-y-10">
          <header>
            <div className="flex flex-wrap gap-2">
              {venue.sports.map((sport) => {
                const meta = sportMeta(sport);
                return (
                  <Link
                    key={sport}
                    to={`/venues?sport=${sport}`}
                    className={cn('rounded-full bg-gradient-to-r px-3 py-1 text-xs font-bold text-white', meta.gradient)}
                  >
                    {meta.emoji} {meta.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-3 flex items-start justify-between gap-4">
              <h1 className="text-3xl leading-tight font-black sm:text-4xl">{venue.name}</h1>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={share}
                  className="flex size-11 items-center justify-center rounded-full border border-line bg-surface transition hover:border-brand-500/60 hover:text-brand-600"
                  aria-label="Sao chép liên kết"
                >
                  <Share2 className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void toggle(venue)}
                  aria-pressed={favorite}
                  aria-label={favorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-full border transition hover:scale-110 active:scale-95',
                    favorite
                      ? 'border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-500/40'
                      : 'border-line bg-surface hover:border-rose-400 hover:text-rose-500'
                  )}
                >
                  <Heart className={cn('size-5', favorite && 'fill-current')} />
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <a href="#danh-gia" className="flex items-center gap-1.5 font-bold hover:underline">
                <Star className="size-4 fill-amber-400 text-amber-400" />
                {venue.rating ? venue.rating.toFixed(1) : 'Chưa có điểm'}
                <span className="font-medium text-muted">({venue.reviewCount} đánh giá)</span>
              </a>
              <span className="flex items-center gap-1.5 text-muted">
                <MapPin className="size-4 text-brand-500" /> {fullAddress}
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                <Clock className="size-4 text-brand-500" /> {venue.openHours.open} – {venue.openHours.close}
              </span>
            </div>
          </header>

          <section>
            <h2 className="text-2xl font-black">Giới thiệu</h2>
            <p className="mt-3 text-base leading-relaxed text-fg/85">{venue.description}</p>
          </section>

          {venue.amenities.length > 0 && (
            <section>
              <h2 className="text-2xl font-black">Tiện ích</h2>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {venue.amenities.map((amenity) => (
                  <li
                    key={amenity}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold shadow-card"
                  >
                    <span className="text-xl">{AMENITY_EMOJI[amenity] ?? '✅'}</span>
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-2xl font-black">
              Danh sách sân <span className="text-lg font-bold text-muted">({venue.courts.length})</span>
            </h2>
            <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
              {venue.courts.map((court, index) => (
                <div
                  key={court.id}
                  className={cn('flex items-center gap-4 px-5 py-4', index > 0 && 'border-t border-line')}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-2xl">
                    {sportMeta(court.type).emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{court.name}</p>
                    <p className="truncate text-sm text-muted">
                      {[sportMeta(court.type).label, court.size, court.surface].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="font-extrabold text-brand-600 dark:text-brand-400">{formatVnd(court.pricePerHour)}</span>
                    <span className="block text-xs text-muted">mỗi giờ</span>
                  </p>
                </div>
              ))}
            </div>
          </section>

          {venue.rules && (
            <section>
              <h2 className="text-2xl font-black">Nội quy sân</h2>
              <div className="mt-4 flex gap-4 rounded-3xl border border-amber-500/30 bg-amber-500/[0.08] p-5">
                <ScrollText className="mt-0.5 size-6 shrink-0 text-amber-500" />
                <div className="text-sm leading-relaxed">
                  <p className="whitespace-pre-line">{venue.rules}</p>
                  {venue.transferRequiresApproval && (
                    <p className="mt-2 font-semibold text-amber-700 dark:text-amber-300">
                      Chuyển sân cần được chủ sân phê duyệt.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {venue.cancellationPolicy?.length > 0 && (
            <section>
              <h2 className="text-2xl font-black">Chính sách huỷ</h2>
              <p className="mt-2 text-sm text-muted">Số tiền hoàn lại phụ thuộc vào việc bạn huỷ trước giờ chơi bao lâu.</p>
              <CancellationPolicyTable tiers={venue.cancellationPolicy} className="mt-4" />
            </section>
          )}

          <Reviews venueId={venue.id} onChanged={reload} />
        </div>

        {/* Cột đặt sân */}
        <aside className="lg:sticky lg:top-24">
          <BookingPanel key={venue.id} venue={venue} />
        </aside>
      </div>

      {/* Thanh đặt nhanh trên mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <p className="leading-tight">
            <span className="block text-xs text-muted">Giá chỉ từ</span>
            <span className="text-lg font-black text-brand-600 dark:text-brand-400">
              {venue.minPrice != null ? formatVnd(venue.minPrice) : '—'}
              <span className="text-xs font-semibold text-muted"> /giờ</span>
            </span>
          </p>
          <Button onClick={() => document.getElementById('dat-san')?.scrollIntoView({ behavior: 'smooth' })}>
            Chọn giờ &amp; đặt sân
          </Button>
        </div>
      </div>
    </div>
  );
}
