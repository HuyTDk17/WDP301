import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  Heart,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { ROLE_LABEL } from '../lib/constants';
import { cn, formatVnd } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { PageHeader } from '../components/Layout';
import { Avatar, ButtonLink, ErrorState, Skeleton } from '../components/ui';

const ACCOUNT_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: 'Đang hoạt động', className: 'bg-brand-500/15 text-brand-700 dark:text-brand-300' },
  locked: { label: 'Đang bị khoá', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  banned: { label: 'Bị cấm', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
};

const OWNER_APPLICATION: Record<string, string> = {
  pending: 'Hồ sơ chủ sân đang chờ duyệt',
  approved: 'Hồ sơ chủ sân đã được duyệt',
  rejected: 'Hồ sơ chủ sân bị từ chối',
};

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand-600 dark:text-brand-400">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
        <dd className="mt-0.5 font-semibold break-words">{children}</dd>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  to,
  tone,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  to?: string;
  tone: string;
}) {
  const body = (
    <>
      <span className={cn('flex size-11 items-center justify-center rounded-2xl text-white', tone)}>{icon}</span>
      <span className="mt-4 block text-2xl font-black">{value}</span>
      <span className="mt-0.5 block text-sm text-muted">{label}</span>
    </>
  );
  const className =
    'block rounded-3xl border border-line bg-surface p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift';
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default function Profile() {
  const { data, loading, error, reload } = useAsync((signal) => api.profile(signal), []);

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Tài khoản" title="Hồ sơ của tôi" />
        <div className="container-page py-8">
          <ErrorState message={error} onRetry={reload} />
        </div>
      </>
    );
  }

  const user = data?.user;
  const stats = data?.stats;
  const status = ACCOUNT_STATUS[user?.status ?? 'active'] ?? ACCOUNT_STATUS.active;

  return (
    <>
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ của tôi" description="Thông tin cá nhân và tổng quan hoạt động đặt sân của bạn." />

      <section className="container-page grid gap-8 py-8 lg:grid-cols-[22rem_1fr]">
        {/* Thẻ danh tính */}
        <aside className="self-start overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
          <div className="relative h-28 bg-ink">
            <div className="absolute inset-0 bg-grid" />
            <div className="absolute -top-10 right-0 size-40 rounded-full bg-brand-500/40 blur-3xl" />
          </div>
          <div className="-mt-12 px-6 pb-6 text-center">
            {loading || !user ? (
              <>
                <Skeleton className="mx-auto size-24 rounded-full" />
                <Skeleton className="mx-auto mt-4 h-6 w-40" />
                <Skeleton className="mx-auto mt-2 h-4 w-28" />
              </>
            ) : (
              <>
                <Avatar name={user.name} className="relative size-24 text-3xl ring-4 ring-surface" />
                <h2 className="mt-4 text-xl font-black">{user.name}</h2>
                <p className="mt-1 text-sm text-muted">{user.email}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className="rounded-full bg-brand-gradient px-3 py-1 text-xs font-bold text-white">
                    {ROLE_LABEL[user.role] ?? user.role}
                  </span>
                  <span className={cn('rounded-full px-3 py-1 text-xs font-bold', status.className)}>{status.label}</span>
                </div>
                {user.bio && <p className="mt-4 text-sm leading-relaxed text-muted">{user.bio}</p>}
                <p className="mt-5 flex items-center justify-center gap-1.5 border-t border-line pt-4 text-xs text-muted">
                  <CalendarDays className="size-3.5" />
                  Thành viên từ {new Date(user.createdAt).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                </p>
              </>
            )}
          </div>
        </aside>

        <div className="space-y-8">
          {/* Tổng quan */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {loading || !stats ? (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36 rounded-3xl" />)
            ) : (
              <>
                <StatCard
                  icon={<CalendarCheck className="size-5" />}
                  value={stats.totalBookings}
                  label={`Lượt đặt · ${stats.completedBookings} đã chơi`}
                  to="/bookings"
                  tone="bg-brand-gradient"
                />
                <StatCard
                  icon={<Wallet className="size-5" />}
                  value={formatVnd(stats.totalSpent)}
                  label="Đã chi cho các lượt đã chơi"
                  tone="bg-gradient-to-br from-sky-500 to-indigo-600"
                />
                <StatCard
                  icon={<Heart className="size-5" />}
                  value={stats.favorites}
                  label="Sân yêu thích"
                  to="/favorites"
                  tone="bg-gradient-to-br from-rose-500 to-pink-600"
                />
                <StatCard
                  icon={<Star className="size-5" />}
                  value={stats.reviews}
                  label="Đánh giá đã viết"
                  tone="bg-gradient-to-br from-amber-400 to-orange-600"
                />
              </>
            )}
          </div>

          {/* Thông tin cá nhân */}
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
            <h2 className="text-lg font-black">Thông tin cá nhân</h2>
            {loading || !user ? (
              <div className="mt-4 space-y-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <dl className="mt-2 grid divide-y divide-line sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
                <InfoRow icon={<Mail className="size-5" />} label="Email">
                  <span className="flex flex-wrap items-center gap-2">
                    {user.email}
                    {user.emailVerified && (
                      <span className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400">
                        <BadgeCheck className="size-4" /> Đã xác minh
                      </span>
                    )}
                  </span>
                </InfoRow>
                <InfoRow icon={<Phone className="size-5" />} label="Số điện thoại">
                  {user.phone || <span className="font-normal text-muted">Chưa cập nhật</span>}
                </InfoRow>
                <InfoRow icon={<MapPin className="size-5" />} label="Thành phố">
                  {user.city || <span className="font-normal text-muted">Chưa cập nhật</span>}
                </InfoRow>
                <InfoRow icon={<Wallet className="size-5" />} label="Số dư tài khoản">
                  {formatVnd(user.creditBalance)}
                </InfoRow>
                <InfoRow icon={<ShieldCheck className="size-5" />} label="Đăng nhập bằng">
                  {user.authProvider === 'local' ? 'Email và mật khẩu' : user.authProvider}
                </InfoRow>
                {user.businessName && (
                  <InfoRow icon={<BadgeCheck className="size-5" />} label="Doanh nghiệp">
                    {user.businessName}
                  </InfoRow>
                )}
              </dl>
            )}
            {user && OWNER_APPLICATION[user.ownerApplicationStatus] && (
              <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm font-semibold">
                🏟️ {OWNER_APPLICATION[user.ownerApplicationStatus]}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/venues">Đặt sân mới</ButtonLink>
            <ButtonLink to="/bookings" variant="secondary">
              Xem lịch đặt
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
