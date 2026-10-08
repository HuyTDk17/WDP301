import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import { api, type Venue } from '../lib/api';
import { CITY_IMAGES, CITY_NAMES, SPORTS, sportMeta } from '../lib/constants';
import { cn, formatCompactVnd } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { ButtonLink, ErrorState, SmartImage } from '../components/ui';
import { VenueCard, VenueCardSkeleton, VenueGrid } from '../components/VenueCard';

// ── Hero ──────────────────────────────────────────────────────────────────

function HeroSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sport, setSport] = useState('');
  const [city, setCity] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (sport) params.set('sport', sport);
    if (city) params.set('city', city);
    navigate(`/venues${params.toString() ? `?${params}` : ''}`);
  };

  const select =
    'h-14 w-full appearance-none bg-transparent px-4 text-sm font-semibold text-white outline-none [&>option]:text-ink';

  return (
    <form
      onSubmit={submit}
      className="glass flex flex-col gap-1 rounded-3xl p-2 shadow-2xl shadow-ink/40 lg:flex-row lg:items-center"
    >
      <label className="flex flex-1 items-center gap-3 rounded-2xl px-4 transition focus-within:bg-white/10">
        <Search className="size-5 shrink-0 text-lime" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tên sân, đường… (gõ không dấu cũng được)"
          className="h-14 w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/50"
          aria-label="Từ khoá tìm sân"
        />
      </label>
      <span className="hidden h-8 w-px bg-white/15 lg:block" />
      <select value={sport} onChange={(e) => setSport(e.target.value)} className={cn(select, 'lg:w-44')} aria-label="Môn thể thao">
        <option value="">Mọi môn</option>
        {SPORTS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.emoji} {s.label}
          </option>
        ))}
      </select>
      <span className="hidden h-8 w-px bg-white/15 lg:block" />
      <select value={city} onChange={(e) => setCity(e.target.value)} className={cn(select, 'lg:w-48')} aria-label="Thành phố">
        <option value="">Toàn quốc</option>
        {CITY_NAMES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl bg-lime px-7 text-base font-extrabold text-ink transition hover:brightness-105 active:scale-[0.98]"
      >
        <Search className="size-5" /> Tìm sân
      </button>
    </form>
  );
}

function HeroVisual({ venues }: { venues: Venue[] }) {
  const [main, second, third] = venues;

  return (
    <div className="relative mx-auto hidden h-[30rem] w-full max-w-md lg:block" aria-hidden>
      <div className="absolute top-6 right-0 h-80 w-64 rotate-3 overflow-hidden rounded-[2rem] border border-white/15 shadow-2xl shadow-ink">
        <SmartImage src={main?.images[0]} alt="" eager className="size-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
        {main && (
          <div className="absolute inset-x-4 bottom-4 text-white">
            <p className="line-clamp-1 text-sm font-bold">{main.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-white/75">
              <MapPin className="size-3" /> {main.address.district}, {main.address.city}
            </p>
          </div>
        )}
      </div>

      <div className="absolute top-40 left-0 h-56 w-48 -rotate-6 overflow-hidden rounded-[1.75rem] border border-white/15 shadow-2xl shadow-ink">
        <SmartImage src={second?.images[0]} alt="" eager className="size-full" />
      </div>

      <div className="absolute bottom-0 left-28 h-40 w-56 rotate-2 overflow-hidden rounded-[1.75rem] border border-white/15 shadow-2xl shadow-ink">
        <SmartImage src={third?.images[0]} alt="" eager className="size-full" />
      </div>

      {/* Thẻ nổi */}
      <div className="glass absolute top-0 left-4 flex animate-float items-center gap-3 rounded-2xl px-4 py-3 text-white">
        <span className="flex size-10 items-center justify-center rounded-xl bg-lime text-ink">
          <CheckCircle2 className="size-5" />
        </span>
        <span>
          <span className="block text-sm font-bold">Đặt sân thành công</span>
          <span className="block text-xs text-white/70">Hôm nay · 18:00 – 19:30</span>
        </span>
      </div>

      <div
        className="glass absolute right-2 bottom-10 animate-float rounded-2xl px-4 py-3 text-white"
        style={{ animationDelay: '-3.5s' }}
      >
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <Star className="size-4 fill-amber-400 text-amber-400" />
          {main?.rating ? main.rating.toFixed(1) : '5.0'} / 5
        </span>
        <span className="block text-xs text-white/70">Người chơi đánh giá</span>
      </div>
    </div>
  );
}

function Hero({ featured, total }: { featured: Venue[]; total: number | null }) {
  const stats = [
    { value: total ? `${total}+` : '—', label: 'Địa điểm đã duyệt' },
    { value: '213', label: 'Sân sẵn sàng' },
    { value: '8', label: 'Môn thể thao' },
    { value: '5', label: 'Thành phố' },
  ];

  return (
    <section className="relative overflow-hidden bg-ink pt-16 text-white lg:pt-[4.5rem]">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full bg-brand-500/30 blur-[130px]" />
      <div className="pointer-events-none absolute top-20 right-0 size-[28rem] rounded-full bg-lime/15 blur-[120px]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />

      <div className="container-page relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
        <div>
          <p className="inline-flex animate-fade-up items-center gap-2 rounded-full bg-white/8 px-4 py-1.5 text-sm font-semibold text-white/85 ring-1 ring-white/15">
            <Sparkles className="size-4 text-lime" />
            Giờ trống cập nhật theo thời gian thực
          </p>

          <h1
            className="mt-6 animate-fade-up text-[2.6rem] leading-[1.05] font-black sm:text-6xl xl:text-7xl"
            style={{ animationDelay: '80ms' }}
          >
            Đặt sân thể thao
            <br />
            <span className="text-gradient">chỉ trong 30 giây</span>
          </h1>

          <p
            className="mt-6 max-w-xl animate-fade-up text-base leading-relaxed text-white/65 sm:text-lg"
            style={{ animationDelay: '160ms' }}
          >
            Bóng đá, cầu lông, tennis, bóng rổ… Tìm sân gần bạn, chọn khung giờ còn trống và giữ chỗ ngay — không cần
            gọi điện, không lo trùng lịch.
          </p>

          <div className="mt-9 animate-fade-up" style={{ animationDelay: '240ms' }}>
            <HeroSearch />
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-white/50">Tìm nhanh:</span>
              {SPORTS.slice(0, 5).map((s) => (
                <Link
                  key={s.key}
                  to={`/venues?sport=${s.key}`}
                  className="rounded-full bg-white/8 px-3 py-1.5 font-semibold text-white/85 ring-1 ring-white/10 transition hover:bg-lime hover:text-ink"
                >
                  {s.emoji} {s.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <HeroVisual venues={featured} />
      </div>

      <div className="relative border-t border-white/10 bg-white/[0.03]">
        <dl className="container-page grid grid-cols-2 gap-y-6 py-7 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center sm:text-left">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block text-3xl font-black text-white sm:text-4xl">{stat.value}</span>
                <span className="mt-1 block text-sm text-white/55">{stat.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ── Các khối nội dung ─────────────────────────────────────────────────────

function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold tracking-widest text-brand-600 uppercase dark:text-brand-400">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-black sm:text-4xl">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-muted">{description}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="group flex items-center gap-1.5 text-sm font-bold text-brand-600 dark:text-brand-400"
        >
          {action.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

function SportsSection() {
  // Đếm số sân từng môn (mỗi request chỉ lấy 1 bản ghi để đọc `total`).
  const { data: counts } = useAsync(
    async (signal) => {
      const totals = await Promise.all(
        SPORTS.map((s) => api.venues({ sport: s.key, pageSize: 1 }, signal).then((r) => r.total))
      );
      return Object.fromEntries(SPORTS.map((s, i) => [s.key, totals[i]])) as Record<string, number>;
    },
    []
  );

  return (
    <section className="container-page py-16 sm:py-20">
      <SectionTitle
        eyebrow="Môn thể thao"
        title="Hôm nay bạn chơi gì?"
        description="Chọn môn yêu thích để xem ngay các sân đang mở cửa."
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {SPORTS.map((sport, index) => (
          <Link
            key={sport.key}
            to={`/venues?sport=${sport.key}`}
            className={cn(
              'group relative flex animate-fade-up flex-col items-center overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-center text-white shadow-card',
              'transition-all duration-300 hover:-translate-y-2 hover:shadow-lift',
              sport.gradient
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className="pointer-events-none absolute -top-6 -right-6 size-20 rounded-full bg-white/15 transition-transform duration-500 group-hover:scale-[2.2]" />
            <span className="relative text-4xl drop-shadow-lg transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">
              {sport.emoji}
            </span>
            <span className="relative mt-3 text-sm font-extrabold">{sport.label}</span>
            <span className="relative mt-0.5 text-xs font-medium text-white/75">
              {counts ? `${counts[sport.key]} sân` : '…'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CitiesSection() {
  const { data: counts } = useAsync(
    async (signal) => {
      const totals = await Promise.all(
        CITY_NAMES.map((city) => api.venues({ city, pageSize: 1 }, signal).then((r) => r.total))
      );
      return Object.fromEntries(CITY_NAMES.map((c, i) => [c, totals[i]])) as Record<string, number>;
    },
    []
  );

  return (
    <section className="container-page py-16 sm:py-20">
      <SectionTitle eyebrow="Khu vực" title="Sân ở gần bạn" description="E360Sport có mặt tại 5 thành phố lớn." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CITY_NAMES.map((city, index) => (
          <Link
            key={city}
            to={`/venues?city=${encodeURIComponent(city)}`}
            className={cn(
              'group relative h-56 animate-fade-up overflow-hidden rounded-3xl shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift',
              index === 0 && 'sm:col-span-2 lg:col-span-1'
            )}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <SmartImage
              src={CITY_IMAGES[city]}
              alt={city}
              fallback="🏙️"
              className="size-full transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/25 to-transparent" />
            <div className="absolute inset-x-5 bottom-5 text-white">
              <p className="text-xl font-black">{city}</p>
              <p className="mt-0.5 text-sm text-white/75">{counts ? `${counts[city]} địa điểm` : 'Đang tải…'}</p>
            </div>
            <span className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 transition-all duration-300 group-hover:opacity-100">
              <ArrowRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <Search className="size-6" />,
      title: 'Tìm sân phù hợp',
      text: 'Lọc theo môn, thành phố, quận — tìm tên sân kể cả khi gõ không dấu.',
    },
    {
      icon: <CalendarCheck className="size-6" />,
      title: 'Chọn khung giờ trống',
      text: 'Lịch hiển thị từng slot 30 phút, biết ngay giờ nào còn, giờ nào đã có người đặt.',
    },
    {
      icon: <Zap className="size-6" />,
      title: 'Giữ chỗ tức thì',
      text: 'Xác nhận là xong. Hệ thống khoá slot ngay nên không bao giờ bị trùng lịch.',
    },
  ];

  return (
    <section className="bg-surface-2/60 py-16 sm:py-20">
      <div className="container-page">
        <SectionTitle eyebrow="Cách hoạt động" title="Ba bước là ra sân" />
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="group relative overflow-hidden rounded-3xl border border-line bg-surface p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
            >
              <span className="absolute -top-4 right-3 text-[7rem] leading-none font-black text-surface-2 transition-colors duration-300 group-hover:text-brand-500/15">
                {index + 1}
              </span>
              <span className="relative flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
                {step.icon}
              </span>
              <h3 className="relative mt-6 text-xl font-extrabold">{step.title}</h3>
              <p className="relative mt-2 leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function PriceTicker({ venues }: { venues: Venue[] }) {
  if (venues.length < 4) return null;
  const loop = [...venues, ...venues];

  return (
    <div className="overflow-hidden border-y border-line bg-surface py-4" aria-hidden>
      <div className="flex w-max animate-marquee gap-10 hover:[animation-play-state:paused]">
        {loop.map((venue, index) => {
          const meta = sportMeta(venue.sports[0] ?? '');
          return (
            // eslint-disable-next-line react/no-array-index-key
            <span key={`${venue.id}-${index}`} className="flex items-center gap-2.5 text-sm whitespace-nowrap">
              <span className="text-lg">{meta.emoji}</span>
              <span className="font-bold">{venue.name}</span>
              <span className="text-muted">{venue.address.district}</span>
              {venue.minPrice != null && (
                <span className="rounded-full bg-brand-500/12 px-2 py-0.5 text-xs font-bold text-brand-700 dark:text-brand-300">
                  từ {formatCompactVnd(venue.minPrice)}/giờ
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CallToAction() {
  const { user } = useAuth();

  return (
    <section className="container-page pt-16 sm:pt-20">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-ink px-6 py-14 text-center text-white sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-grid" />
        <div className="pointer-events-none absolute -top-24 left-1/4 size-80 rounded-full bg-brand-500/40 blur-[100px]" />
        <div className="pointer-events-none absolute -right-10 -bottom-24 size-80 rounded-full bg-lime/25 blur-[100px]" />
        <div className="relative mx-auto max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold ring-1 ring-white/15">
            <ShieldCheck className="size-4 text-lime" /> Không bao giờ trùng lịch
          </span>
          <h2 className="mt-6 text-3xl font-black sm:text-5xl">
            Sân đã sẵn sàng. <span className="text-gradient">Còn bạn?</span>
          </h2>
          <p className="mt-4 text-white/65 sm:text-lg">
            {user
              ? 'Chọn sân, chọn giờ và rủ đồng đội ra sân ngay hôm nay.'
              : 'Tạo tài khoản miễn phí để đặt sân, lưu sân yêu thích và nhận thông báo lịch chơi.'}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/venues" variant="lime" size="lg">
              Khám phá sân ngay <ArrowRight className="size-5" />
            </ButtonLink>
            {!user && (
              <ButtonLink
                to="/register"
                variant="secondary"
                size="lg"
                className="border-white/20 bg-white/10 text-white hover:bg-white/20"
              >
                Tạo tài khoản
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Trang chủ ─────────────────────────────────────────────────────────────

export default function Home() {
  // API đã sắp xếp theo rating giảm dần → 8 sân đầu là sân nổi bật.
  const featured = useAsync((signal) => api.venues({ pageSize: 8 }, signal), []);
  const venues = featured.data?.items ?? [];

  return (
    <>
      <Hero featured={venues} total={featured.data?.total ?? null} />
      <PriceTicker venues={venues} />
      <SportsSection />

      <section className="container-page pb-4">
        <SectionTitle
          eyebrow="Nổi bật"
          title="Sân được yêu thích nhất"
          description="Xếp hạng theo điểm đánh giá của người chơi."
          action={{ label: 'Xem tất cả sân', to: '/venues' }}
        />
        {featured.error ? (
          <ErrorState message={featured.error} onRetry={featured.reload} />
        ) : (
          <VenueGrid>
            {featured.loading
              ? Array.from({ length: 8 }, (_, i) => <VenueCardSkeleton key={i} />)
              : venues.map((venue, index) => <VenueCard key={venue.id} venue={venue} index={index} />)}
          </VenueGrid>
        )}
      </section>

      <CitiesSection />
      <HowItWorks />
      <CallToAction />
    </>
  );
}
