import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Heart, MapPin, Star } from 'lucide-react';
import type { Address, OpenHours } from '../lib/api';
import { sportMeta } from '../lib/constants';
import { cn, formatCompactVnd } from '../lib/format';
import { useFavorites } from '../context/FavoritesContext';
import { Skeleton, SmartImage } from './ui';

export interface VenueCardData {
  id: string;
  name: string;
  address: Address;
  images: string[];
  rating: number;
  reviewCount: number;
  sports?: string[];
  openHours?: OpenHours;
  minPrice?: number | null;
}

export function FavoriteButton({
  venue,
  className,
}: {
  venue: { id: string; name: string };
  className?: string;
}) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(venue.id);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle(venue);
      }}
      aria-pressed={active}
      aria-label={active ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
      className={cn(
        'flex size-10 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95',
        active ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40' : 'bg-white/90 text-ink backdrop-blur hover:bg-white',
        className
      )}
    >
      <Heart className={cn('size-[18px]', active && 'fill-current')} />
    </button>
  );
}

export function VenueCard({
  venue,
  index = 0,
  linkSearch = '',
  matchLabel,
}: {
  venue: VenueCardData;
  index?: number;
  /** Query string nối vào link chi tiết (ví dụ ngày/giờ đang lọc). */
  linkSearch?: string;
  /** Nhãn kết quả lọc, ví dụ "3 sân còn trống". */
  matchLabel?: string;
}) {
  const primarySport = venue.sports?.[0];
  const meta = primarySport ? sportMeta(primarySport) : null;

  return (
    <Link
      to={`/venues/${venue.id}${linkSearch}`}
      className="group relative flex animate-fade-up flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-500/40 hover:shadow-lift"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <SmartImage
          src={venue.images?.[0]}
          alt={venue.name}
          fallback={meta?.emoji}
          className="size-full transition-transform duration-700 ease-out group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/5 to-transparent" />

        <div className="absolute inset-x-3 top-3 flex items-start justify-between">
          <div className="flex flex-wrap gap-1.5">
            {venue.sports?.slice(0, 2).map((sport) => {
              const s = sportMeta(sport);
              return (
                <span
                  key={sport}
                  className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-ink backdrop-blur"
                >
                  {s.emoji} {s.label}
                </span>
              );
            })}
          </div>
          <FavoriteButton venue={venue} />
        </div>

        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between text-white">
          <span className="flex items-center gap-1 rounded-full bg-ink/60 px-2.5 py-1 text-xs font-bold backdrop-blur">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {venue.rating ? venue.rating.toFixed(1) : 'Mới'}
            {venue.reviewCount > 0 && <span className="font-medium text-white/70">({venue.reviewCount})</span>}
          </span>
          {venue.minPrice != null && (
            <span className="text-right leading-tight">
              <span className="block text-[11px] font-medium text-white/75">chỉ từ</span>
              <span className="text-lg font-extrabold">
                {formatCompactVnd(venue.minPrice)}
                <span className="text-xs font-semibold text-white/75">/giờ</span>
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-1 text-base font-bold transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
          {venue.name}
        </h3>
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brand-500" />
          <span className="line-clamp-1">
            {venue.address.street}, {venue.address.district}, {venue.address.city}
          </span>
        </p>
        {matchLabel && (
          <p className="self-start rounded-full bg-brand-500/12 px-2.5 py-1 text-xs font-bold text-brand-700 dark:text-brand-300">
            ✓ {matchLabel}
          </p>
        )}
        {venue.openHours && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Clock className="size-4 shrink-0 text-brand-500" />
            {venue.openHours.open} – {venue.openHours.close}
          </p>
        )}
        <span className="mt-auto pt-2 text-sm font-bold text-brand-600 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100 dark:text-brand-400">
          Xem lịch &amp; đặt sân →
        </span>
      </div>
    </Link>
  );
}

export function VenueCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}

export function VenueGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}
