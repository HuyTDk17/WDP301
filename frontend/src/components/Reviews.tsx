import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquarePlus, Star, ThumbsUp } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { cn, timeAgo } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Button, Skeleton, Stars } from './ui';

const RATING_LABELS = ['', 'Tệ', 'Chưa tốt', 'Tạm ổn', 'Tốt', 'Tuyệt vời'];

function ReviewForm({ venueId, onCreated }: { venueId: string; onCreated: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!rating) {
      toast.info('Hãy chọn số sao trước khi gửi nhé');
      return;
    }
    setSubmitting(true);
    try {
      await api.createReview({ venueId, rating, comment: comment.trim() || undefined });
      toast.success('Cảm ơn bạn đã đánh giá!');
      setRating(0);
      setComment('');
      onCreated();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.friendly : 'Không gửi được đánh giá');
    } finally {
      setSubmitting(false);
    }
  };

  const shown = hover || rating;

  return (
    <form onSubmit={submit} className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <p className="flex items-center gap-2 font-bold">
        <MessageSquarePlus className="size-5 text-brand-500" /> Viết đánh giá của bạn
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              aria-label={`${n} sao`}
              aria-pressed={rating === n}
              className="rounded-lg p-0.5 transition-transform hover:scale-125"
            >
              <Star className={cn('size-8 transition-colors', n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-line text-line')} />
            </button>
          ))}
        </div>
        <span className="text-sm font-bold text-amber-500">{RATING_LABELS[shown]}</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Chất lượng sân, ánh sáng, thái độ phục vụ… chia sẻ để mọi người cùng biết nhé."
        className="mt-4 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm transition placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">{comment.length}/1000</span>
        <Button type="submit" loading={submitting}>
          Gửi đánh giá
        </Button>
      </div>
    </form>
  );
}

export default function Reviews({
  venueId,
  onChanged,
}: {
  venueId: string;
  /** Gọi sau khi có đánh giá mới để trang cha nạp lại điểm trung bình. */
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const { data, loading, error, reload } = useAsync((signal) => api.reviews(venueId, signal), [venueId]);
  const [showAll, setShowAll] = useState(false);

  const reviews = data ?? [];
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));
  const visible = showAll ? reviews : reviews.slice(0, 5);

  return (
    <section id="danh-gia" className="scroll-mt-28">
      <h2 className="text-2xl font-black">Đánh giá từ người chơi</h2>

      <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center rounded-3xl bg-ink px-10 py-7 text-white">
          <span className="text-6xl leading-none font-black">{average ? average.toFixed(1) : '—'}</span>
          <span className="mt-3">
            <Stars value={average} size="size-5" />
          </span>
          <span className="mt-2 text-sm text-white/60">{reviews.length} đánh giá</span>
        </div>
        <div className="flex flex-col justify-center gap-2 rounded-3xl border border-line bg-surface p-5 shadow-card">
          {breakdown.map(({ star, count }) => (
            <div key={star} className="flex items-center gap-3 text-sm">
              <span className="flex w-8 shrink-0 items-center gap-1 font-bold">
                {star} <Star className="size-3.5 fill-amber-400 text-amber-400" />
              </span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700"
                  style={{ width: `${reviews.length ? (count / reviews.length) * 100 : 0}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right text-muted tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {user ? (
          <ReviewForm
            venueId={venueId}
            onCreated={() => {
              reload();
              onChanged();
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-dashed border-line bg-surface p-5">
            <p className="text-sm text-muted">Bạn đã chơi ở đây? Đăng nhập để chia sẻ trải nghiệm.</p>
            <Link
              to="/login"
              state={{ from: location.pathname }}
              className="text-sm font-bold text-brand-600 hover:underline dark:text-brand-400"
            >
              Đăng nhập để đánh giá →
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)
        ) : error ? (
          <p className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-300">{error}</p>
        ) : !reviews.length ? (
          <p className="rounded-3xl bg-surface-2 p-8 text-center text-sm text-muted">
            Chưa có đánh giá nào. Hãy là người đầu tiên! ✍️
          </p>
        ) : (
          visible.map((review) => {
            const name = review.user?.name ?? 'Người chơi ẩn danh';
            return (
              <article key={review.id} className="rounded-3xl border border-line bg-surface p-5 shadow-card">
                <header className="flex items-center gap-3">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{name}</p>
                    <p className="text-xs text-muted">{timeAgo(review.createdAt)}</p>
                  </div>
                  <Stars value={review.rating} />
                </header>
                {review.comment && <p className="mt-3 leading-relaxed text-fg/90">{review.comment}</p>}
                {review.helpful > 0 && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                    <ThumbsUp className="size-3.5" /> {review.helpful} người thấy hữu ích
                  </p>
                )}
              </article>
            );
          })
        )}

        {reviews.length > 5 && (
          <Button variant="secondary" className="w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Thu gọn' : `Xem tất cả ${reviews.length} đánh giá`}
          </Button>
        )}
      </div>
    </section>
  );
}
