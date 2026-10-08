import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck } from 'lucide-react';
import { api, type NotificationItem } from '../lib/api';
import { cn, timeAgo } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/Layout';
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui';

export default function Notifications() {
  const toast = useToast();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, loading, error, reload, setData } = useAsync(
    (signal) => api.notifications(unreadOnly, signal),
    [unreadOnly]
  );

  const markAll = async () => {
    try {
      const { updated } = await api.markNotificationsRead({ all: true });
      toast.success(updated ? `Đã đánh dấu ${updated} thông báo là đã đọc` : 'Không còn thông báo chưa đọc');
      reload();
    } catch {
      toast.error('Không cập nhật được thông báo');
    }
  };

  const open = (item: NotificationItem) => {
    if (!item.read) {
      // Cập nhật ngay trên giao diện, đồng bộ server ở nền.
      setData((prev) =>
        prev
          ? {
              ...prev,
              unread: Math.max(0, prev.unread - 1),
              items: prev.items.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
            }
          : prev
      );
      api.markNotificationsRead({ ids: [item.id] }).catch(() => undefined);
    }
    if (item.link?.startsWith('/')) navigate(item.link);
  };

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Tài khoản"
        title="Thông báo"
        description={
          data ? (
            <>
              Bạn có <strong className="text-lime">{data.unread}</strong> thông báo chưa đọc trong tổng số {data.total}.
            </>
          ) : (
            'Cập nhật về lịch đặt và thanh toán của bạn.'
          )
        }
      />

      <section className="container-page max-w-3xl py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-full border border-line bg-surface p-1">
            {[
              { value: false, label: 'Tất cả' },
              { value: true, label: 'Chưa đọc' },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setUnreadOnly(tab.value)}
                aria-pressed={unreadOnly === tab.value}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-bold transition',
                  unreadOnly === tab.value ? 'bg-brand-gradient text-white shadow-glow' : 'text-muted hover:text-fg'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={markAll} disabled={!data?.unread}>
            <CheckCheck className="size-4" /> Đánh dấu đã đọc tất cả
          </Button>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            emoji="🔔"
            title={unreadOnly ? 'Bạn đã đọc hết thông báo' : 'Chưa có thông báo nào'}
            description="Khi bạn đặt sân hoặc có thay đổi về lịch chơi, thông báo sẽ xuất hiện ở đây."
          />
        ) : (
          <ul className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
            {items.map((item, index) => (
              <li key={item.id} className={cn(index > 0 && 'border-t border-line')}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className={cn(
                    'flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-surface-2',
                    !item.read && 'bg-brand-500/[0.06]'
                  )}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-xl">
                    {item.icon || '🔔'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn('truncate', item.read ? 'font-semibold' : 'font-extrabold')}>{item.title}</span>
                      {!item.read && <span className="size-2 shrink-0 rounded-full bg-brand-500" />}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted">{item.message}</span>
                  </span>
                  <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted">{timeAgo(item.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
