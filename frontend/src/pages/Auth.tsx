import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck, Eye, EyeOff, Heart, Lock, Mail, Phone, Star, User as UserIcon, Zap } from 'lucide-react';
import { ApiError } from '../lib/api';
import { cn } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Logo } from '../components/Layout';
import { Button, Field, inputClass } from '../components/ui';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1400&q=80';

const DEMO_ACCOUNTS = [
  { label: 'Người chơi', emoji: '🏃', email: 'phamha@gmail.com', password: '12345678' },
  { label: 'Chủ sân', emoji: '🏟️', email: 'nguyenan@gmail.com', password: '12345678' },
];

/** Khung 2 cột dùng chung cho đăng nhập / đăng ký. */
function AuthShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  const perks = [
    { icon: <Zap className="size-5" />, text: 'Đặt sân trong 30 giây, không cần gọi điện' },
    { icon: <CalendarCheck className="size-5" />, text: 'Xem giờ trống theo thời gian thực' },
    { icon: <Heart className="size-5" />, text: 'Lưu sân yêu thích, quản lý lịch chơi' },
  ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Cột hình ảnh */}
      <div className="relative hidden overflow-hidden bg-ink text-white lg:block">
        <img src={HERO_IMAGE} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink/70 to-brand-900/60" />
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute -bottom-32 -left-20 size-96 rounded-full bg-brand-500/40 blur-[110px]" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <Logo light />
          <div>
            <h2 className="text-5xl leading-[1.08] font-black xl:text-6xl">
              Ra sân
              <br />
              <span className="text-gradient">không cần chờ.</span>
            </h2>
            <ul className="mt-10 space-y-4">
              {perks.map((perk) => (
                <li key={perk.text} className="flex items-center gap-4 text-base text-white/85">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-lime ring-1 ring-white/15">
                    {perk.icon}
                  </span>
                  {perk.text}
                </li>
              ))}
            </ul>
          </div>
          <figure className="glass max-w-md rounded-3xl p-6">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className="size-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <blockquote className="mt-3 leading-relaxed text-white/90">
              “Sân chuẩn, đặt giờ nào cũng được chốt nhanh. Từ ngày dùng E360Sport đội mình không còn cảnh tới nơi mới
              biết hết sân.”
            </blockquote>
            <figcaption className="mt-3 text-sm font-semibold text-white/60">— Một người chơi tại TP. Hồ Chí Minh</figcaption>
          </figure>
        </div>
      </div>

      {/* Cột form */}
      <div className="flex flex-col bg-bg">
        <div className="flex items-center justify-between p-6 lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Link to="/" className="text-sm font-semibold text-muted transition hover:text-fg">
            ← Về trang chủ
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-md animate-fade-up">
            <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
            <p className="mt-2 text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconInput({ icon, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode }) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">{icon}</span>
      <input className={cn(inputClass, 'pl-11', className)} {...rest} />
    </span>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">
        <Lock className="size-4" />
      </span>
      <input className={cn(inputClass, 'px-11')} type={show ? 'text' : 'password'} {...props} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg"
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  );
}

/** Gom lỗi từng field mà backend (Zod) trả về. */
const fieldErrors = (error: unknown): Record<string, string> =>
  error instanceof ApiError ? Object.fromEntries(error.details.map((d) => [d.field, d.message])) : {};

const useRedirectTarget = (): string => {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from && from.startsWith('/') && !from.startsWith('/login') && !from.startsWith('/register') ? from : '/';
};

// ── Đăng nhập ─────────────────────────────────────────────────────────────

export function Login() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const target = useRedirectTarget();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={target} replace />;

  const signIn = async (credentials: { email: string; password: string }) => {
    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      const me = await login(credentials.email.trim(), credentials.password);
      toast.success(`Chào mừng trở lại, ${me.name}! 👋`);
      navigate(target, { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      setErrors(fields);
      if (!Object.keys(fields).length) {
        setFormError(error instanceof ApiError ? error.message : 'Đăng nhập thất bại, vui lòng thử lại');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void signIn({ email, password });
  };

  return (
    <AuthShell
      title="Chào mừng trở lại 👋"
      subtitle={
        <>
          Chưa có tài khoản?{' '}
          <Link to="/register" state={location.state} className="font-bold text-brand-600 hover:underline dark:text-brand-400">
            Đăng ký miễn phí
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {formError && (
          <p role="alert" className="animate-pop rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-300">
            {formError}
          </p>
        )}
        <Field label="Email" error={errors.email}>
          <IconInput
            icon={<Mail className="size-4" />}
            type="email"
            autoComplete="email"
            placeholder="ban@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Mật khẩu" error={errors.password}>
          <PasswordInput
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Đăng nhập
        </Button>
      </form>

      <div className="my-7 flex items-center gap-4 text-xs font-semibold tracking-wider text-muted uppercase">
        <span className="h-px flex-1 bg-line" /> Dùng thử nhanh <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            disabled={submitting}
            onClick={() => {
              setEmail(account.email);
              setPassword(account.password);
              void signIn(account);
            }}
            className="group rounded-2xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-500/60 hover:shadow-card disabled:opacity-50"
          >
            <span className="text-2xl">{account.emoji}</span>
            <span className="mt-2 block text-sm font-bold group-hover:text-brand-600 dark:group-hover:text-brand-400">
              {account.label}
            </span>
            <span className="block truncate text-xs text-muted">{account.email}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Tài khoản mẫu trong bộ dữ liệu — bấm để đăng nhập ngay.</p>
    </AuthShell>
  );
}

// ── Đăng ký ───────────────────────────────────────────────────────────────

export function Register() {
  const { user, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const target = useRedirectTarget();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [role, setRole] = useState<'customer' | 'owner'>(params.get('role') === 'owner' ? 'owner' : 'customer');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={target} replace />;

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      const me = await register({ ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), role });
      toast.success(`Tạo tài khoản thành công. Chào ${me.name}! 🎉`);
      navigate(target, { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      setErrors(fields);
      if (!Object.keys(fields).length) {
        setFormError(error instanceof ApiError ? error.message : 'Đăng ký thất bại, vui lòng thử lại');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const roles: { key: 'customer' | 'owner'; emoji: string; label: string; text: string }[] = [
    { key: 'customer', emoji: '🏃', label: 'Người chơi', text: 'Tìm và đặt sân' },
    { key: 'owner', emoji: '🏟️', label: 'Chủ sân', text: 'Có sân cho thuê' },
  ];

  return (
    <AuthShell
      title="Tạo tài khoản"
      subtitle={
        <>
          Đã có tài khoản?{' '}
          <Link to="/login" state={location.state} className="font-bold text-brand-600 hover:underline dark:text-brand-400">
            Đăng nhập
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="animate-pop rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-300">
            {formError}
          </p>
        )}

        <div>
          <span className="mb-1.5 block text-sm font-semibold">Bạn là</span>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRole(option.key)}
                aria-pressed={role === option.key}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition',
                  role === option.key ? 'border-brand-500 bg-brand-500/[0.07]' : 'border-line bg-surface hover:border-brand-500/40'
                )}
              >
                <span className="text-2xl">{option.emoji}</span>
                <span>
                  <span className="block text-sm font-bold">{option.label}</span>
                  <span className="block text-xs text-muted">{option.text}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <Field label="Họ và tên" error={errors.name}>
          <IconInput
            icon={<UserIcon className="size-4" />}
            autoComplete="name"
            placeholder="Nguyễn Văn A"
            value={form.name}
            onChange={set('name')}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={errors.email}>
            <IconInput
              icon={<Mail className="size-4" />}
              type="email"
              autoComplete="email"
              placeholder="ban@email.com"
              value={form.email}
              onChange={set('email')}
              required
            />
          </Field>
          <Field label="Số điện thoại" error={errors.phone}>
            <IconInput
              icon={<Phone className="size-4" />}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="0912345678"
              value={form.phone}
              onChange={set('phone')}
              required
            />
          </Field>
        </div>
        <Field label="Mật khẩu" error={errors.password} hint="Tối thiểu 8 ký tự">
          <PasswordInput
            autoComplete="new-password"
            placeholder="••••••••"
            value={form.password}
            onChange={set('password')}
            required
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Tạo tài khoản
        </Button>
      </form>
    </AuthShell>
  );
}
