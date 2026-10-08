import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Star, X } from 'lucide-react';
import { avatarGradient, cn, initials } from '../lib/format';

// ── Button ────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'lime';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-gradient text-white shadow-glow hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0',
  lime: 'bg-lime text-ink font-bold shadow-[0_10px_30px_-10px_rgb(198_244_50/0.7)] hover:brightness-105 hover:-translate-y-0.5 active:translate-y-0',
  secondary: 'bg-surface text-fg border border-line hover:border-brand-500/60 hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 shadow-[0_10px_30px_-12px_rgb(225_29_72/0.7)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-13 px-7 text-base rounded-2xl gap-2.5',
};

const buttonClass = (variant: Variant, size: Size, className?: string): string =>
  cn(
    'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-all duration-200',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className
  );

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

// ── Hiển thị nhỏ ──────────────────────────────────────────────────────────

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        className
      )}
    >
      {children}
    </span>
  );
}

export function Stars({ value, size = 'size-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(size, n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-line text-line')}
        />
      ))}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white',
        avatarGradient(name),
        className ?? 'size-10 text-sm'
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} />;
}

export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Loader2 className="size-5 animate-spin text-brand-500" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  description,
  action,
}: {
  emoji: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface px-6 py-16 text-center">
      <span className="mb-5 flex size-20 items-center justify-center rounded-3xl bg-surface-2 text-4xl">{emoji}</span>
      <h3 className="text-lg font-bold">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      emoji="😵"
      title="Không tải được dữ liệu"
      description={message}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        )
      }
    />
  );
}

// ── Ảnh có nền dự phòng ───────────────────────────────────────────────────

export function SmartImage({
  src,
  alt,
  fallback = '🏟️',
  className,
  eager,
}: {
  src?: string;
  alt: string;
  fallback?: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-brand-600 to-ink text-5xl',
          className
        )}
        role="img"
        aria-label={alt}
      >
        <span className="opacity-80">{fallback}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={cn('bg-surface-2 object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0', className)}
    />
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: string;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-pop flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-lift sm:rounded-3xl',
          size
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0 text-lg font-bold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 shrink-0 rounded-xl p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line bg-surface-2/50 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ── Phân trang ────────────────────────────────────────────────────────────

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  // Hiện trang đầu, cuối và 1 trang hai bên trang hiện tại.
  const pages: (number | 'gap')[] = [];
  for (let p = 1; p <= pageCount; p += 1) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }

  const arrow = 'flex size-10 items-center justify-center rounded-xl border border-line bg-surface transition hover:border-brand-500/60 disabled:opacity-40';

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Phân trang">
      <button type="button" className={arrow} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước">
        <ChevronLeft className="size-4" />
      </button>
      {pages.map((p, index) =>
        p === 'gap' ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={`gap-${index}`} className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'size-10 rounded-xl text-sm font-semibold transition',
              p === page ? 'bg-brand-gradient text-white shadow-glow' : 'border border-line bg-surface hover:border-brand-500/60'
            )}
          >
            {p}
          </button>
        )
      )}
      <button type="button" className={arrow} disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Trang sau">
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

// ── Trường nhập liệu ──────────────────────────────────────────────────────

export const inputClass =
  'h-12 w-full rounded-xl border border-line bg-surface px-4 text-sm text-fg placeholder:text-muted/70 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15';

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-rose-500">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}
