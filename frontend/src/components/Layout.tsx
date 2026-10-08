import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarCheck,
  CheckCheck,
  ChevronDown,
  Heart,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { api, type NotificationList } from '../lib/api';
import { ROLE_LABEL } from '../lib/constants';
import { cn, timeAgo } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { Avatar, ButtonLink } from './ui';

// ── Logo ──────────────────────────────────────────────────────────────────

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="E360Sport — trang chủ">
      <span className="flex size-10 items-center justify-center rounded-xl bg-ink shadow-lg ring-1 ring-white/10 transition-transform duration-500 group-hover:rotate-[20deg]">
        <svg viewBox="0 0 64 64" className="size-7" aria-hidden>
          <defs>
            <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#c6f432" />
              <stop offset="1" stopColor="#12b76a" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="22" fill="none" stroke="url(#logo-g)" strokeWidth="6" />
          <path
            d="M10 32h44M32 10c9 6 9 38 0 44M32 10c-9 6-9 38 0 44"
            fill="none"
            stroke="url(#logo-g)"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className={cn('text-xl font-black tracking-tight', light ? 'text-white' : 'text-fg')}>
        E360<span className="text-brand-500">Sport</span>
      </span>
    </Link>
  );
}

// ── Đổi theme sáng/tối ────────────────────────────────────────────────────

function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('e360_theme', next ? 'dark' : 'light');
    } catch {
      /* bỏ qua */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn('flex size-10 items-center justify-center rounded-xl transition hover:bg-white/10', className)}
      aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

// ── Đóng popup khi bấm ra ngoài ───────────────────────────────────────────

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);
  return ref;
}

// ── Chuông thông báo ──────────────────────────────────────────────────────

function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationList | null>(null);
  const location = useLocation();
  const ref = useClickOutside(() => setOpen(false));

  // Nạp lại mỗi khi đổi trang (ví dụ vừa đặt sân xong sẽ có thông báo mới).
  useEffect(() => {
    const controller = new AbortController();
    api
      .notifications(false, controller.signal)
      .then(setData)
      .catch(() => undefined);
    return () => controller.abort();
  }, [location.pathname]);

  useEffect(() => setOpen(false), [location.pathname]);

  const markAll = async () => {
    await api.markNotificationsRead({ all: true }).catch(() => undefined);
    setData((prev) => (prev ? { ...prev, unread: 0, items: prev.items.map((n) => ({ ...n, read: true })) } : prev));
  };

  const unread = data?.unread ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('relative flex size-10 items-center justify-center rounded-xl transition hover:bg-white/10', className)}
        aria-label={`Thông báo${unread ? ` (${unread} chưa đọc)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-ink">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] animate-pop overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-bold">Thông báo</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                <CheckCheck className="size-3.5" /> Đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!data?.items.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted">Chưa có thông báo nào</p>
            ) : (
              data.items.slice(0, 6).map((n) => (
                <Link
                  key={n.id}
                  to="/notifications"
                  className={cn(
                    'flex gap-3 border-b border-line/60 px-4 py-3 transition last:border-0 hover:bg-surface-2',
                    !n.read && 'bg-brand-500/[0.06]'
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg">
                    {n.icon || '🔔'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{n.title}</span>
                      {!n.read && <span className="size-2 shrink-0 rounded-full bg-brand-500" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-muted/80">{timeAgo(n.createdAt)}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
          <Link
            to="/notifications"
            className="block border-t border-line bg-surface-2/60 py-3 text-center text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            Xem tất cả thông báo
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Menu người dùng ───────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout } = useAuth();
  const { items: favorites } = useFavorites();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useClickOutside(() => setOpen(false));

  useEffect(() => setOpen(false), [location.pathname]);

  if (!user) return null;

  const item = 'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition hover:bg-white/10"
        aria-expanded={open}
        aria-label="Menu tài khoản"
      >
        <Avatar name={user.name} className="size-9 text-xs ring-2 ring-white/20" />
        <span className="hidden max-w-28 truncate text-sm font-semibold lg:block">{user.name.split(' ').slice(-1)[0]}</span>
        <ChevronDown className={cn('hidden size-4 transition-transform lg:block', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-3 w-64 animate-pop overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-lift">
          <div className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-4">
            <Avatar name={user.name} className="size-11 text-sm" />
            <div className="min-w-0">
              <p className="truncate font-bold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <span className="mt-1 inline-block rounded-full bg-brand-500/12 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:text-brand-300">
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
            </div>
          </div>
          <div className="py-1.5">
            <Link to="/profile" className={item}>
              <UserRound className="size-4 text-sky-500" /> Hồ sơ của tôi
            </Link>
            <Link to="/bookings" className={item}>
              <CalendarCheck className="size-4 text-brand-500" /> Lịch đặt của tôi
            </Link>
            <Link to="/favorites" className={item}>
              <Heart className="size-4 text-rose-500" /> Sân yêu thích
              {favorites.length > 0 && (
                <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold">{favorites.length}</span>
              )}
            </Link>
            <Link to="/notifications" className={item}>
              <Bell className="size-4 text-amber-500" /> Thông báo
            </Link>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/');
            }}
            className={cn(item, 'w-full border-t border-line text-rose-600 dark:text-rose-400')}
          >
            <LogOut className="size-4" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

const NAV = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/venues', label: 'Tìm sân', end: false },
  { to: '/bookings', label: 'Lịch đặt', end: false },
  { to: '/favorites', label: 'Yêu thích', end: false },
];

function Header() {
  const { user, booting, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Trang chủ có hero tối → header trong suốt cho tới khi cuộn.
  const overHero = location.pathname === '/' && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 text-white transition-all duration-300 print:hidden',
        overHero ? 'bg-transparent' : 'border-b border-white/10 bg-ink/85 shadow-lg shadow-ink/20 backdrop-blur-xl'
      )}
    >
      <div className="container-page flex h-16 items-center gap-4 lg:h-[4.5rem]">
        <Logo light />

        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Điều hướng chính">
          {NAV.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'relative rounded-xl px-3.5 py-2 text-sm font-semibold transition',
                  isActive ? 'text-lime' : 'text-white/75 hover:bg-white/10 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {link.label}
                  {isActive && <span className="absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full bg-lime" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            to="/venues"
            className="flex size-10 items-center justify-center rounded-xl transition hover:bg-white/10 md:hidden"
            aria-label="Tìm sân"
          >
            <Search className="size-5" />
          </Link>
          <ThemeToggle />
          {user && <NotificationBell />}

          {booting ? (
            <span className="ml-1 size-9 animate-pulse rounded-full bg-white/15" />
          ) : user ? (
            <UserMenu />
          ) : (
            <div className="ml-2 hidden items-center gap-2 sm:flex">
              <Link
                to="/login"
                state={{ from: location.pathname + location.search }}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
              >
                Đăng nhập
              </Link>
              <ButtonLink to="/register" variant="lime" size="sm">
                Đăng ký
              </ButtonLink>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-10 items-center justify-center rounded-xl transition hover:bg-white/10 md:hidden"
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="animate-fade-in border-t border-white/10 bg-ink/95 backdrop-blur-xl md:hidden">
          <nav className="container-page flex flex-col gap-1 py-4">
            {NAV.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn('rounded-xl px-4 py-3 text-base font-semibold', isActive ? 'bg-white/10 text-lime' : 'text-white/80')
                }
              >
                {link.label}
              </NavLink>
            ))}
            {user ? (
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="mt-2 rounded-xl px-4 py-3 text-left text-base font-semibold text-rose-400"
              >
                Đăng xuất
              </button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:hidden">
                <ButtonLink to="/login" variant="secondary" className="border-white/20 bg-white/10 text-white">
                  Đăng nhập
                </ButtonLink>
                <ButtonLink to="/register" variant="lime">
                  Đăng ký
                </ButtonLink>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────

function Footer() {
  const columns: { title: string; links: { label: string; to: string }[] }[] = [
    {
      title: 'Khám phá',
      links: [
        { label: 'Tất cả sân', to: '/venues' },
        { label: 'Sân bóng đá', to: '/venues?sport=football' },
        { label: 'Sân cầu lông', to: '/venues?sport=badminton' },
        { label: 'Sân tennis', to: '/venues?sport=tennis' },
      ],
    },
    {
      title: 'Khu vực',
      links: [
        { label: 'TP. Hồ Chí Minh', to: '/venues?city=TP.+Hồ+Chí+Minh' },
        { label: 'Hà Nội', to: '/venues?city=Hà+Nội' },
        { label: 'Hải Phòng', to: '/venues?city=Hải+Phòng' },
        { label: 'Đà Nẵng', to: '/venues?city=Đà+Nẵng' },
      ],
    },
    {
      title: 'Tài khoản',
      links: [
        { label: 'Hồ sơ của tôi', to: '/profile' },
        { label: 'Lịch đặt của tôi', to: '/bookings' },
        { label: 'Sân yêu thích', to: '/favorites' },
        { label: 'Thông báo', to: '/notifications' },
        { label: 'Đăng ký chủ sân', to: '/register?role=owner' },
      ],
    },
  ];

  return (
    <footer className="relative mt-24 overflow-hidden bg-ink text-white print:hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[120px]" />

      <div className="container-page relative grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
            Nền tảng đặt sân thể thao trực tuyến — tìm sân gần bạn, xem giờ trống theo thời gian thực và giữ chỗ chỉ
            trong vài chạm.
          </p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/75 ring-1 ring-white/10">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-lime" />
            </span>
            Hệ thống đang hoạt động
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-bold tracking-wide text-white/90 uppercase">{column.title}</p>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="text-sm text-white/60 transition hover:text-lime">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="relative border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-white/45 sm:flex-row">
          <p>© 2026 E360Sport · Đồ án WDP301</p>
          <p>Thiết kế với 💚 cho người yêu thể thao</p>
        </div>
      </div>
    </footer>
  );
}

// ── Khung trang ───────────────────────────────────────────────────────────

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

/** Dải tiêu đề tối ở đầu các trang con (bù chiều cao header cố định). */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-ink pt-16 text-white lg:pt-[4.5rem]">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="pointer-events-none absolute -top-32 right-0 size-96 rounded-full bg-brand-500/25 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 left-10 size-80 rounded-full bg-lime/10 blur-[100px]" />
      <div className="container-page relative py-10 sm:py-14">
        {eyebrow && <p className="mb-2 text-sm font-bold tracking-widest text-lime uppercase">{eyebrow}</p>}
        <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/65">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}
