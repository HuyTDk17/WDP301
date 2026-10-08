const VND = new Intl.NumberFormat('vi-VN');

export const formatVnd = (amount: number): string => `${VND.format(Math.round(amount))}đ`;

/** 250000 → "250K" (gọn cho thẻ sân). */
export const formatCompactVnd = (amount: number): string =>
  amount >= 1_000_000
    ? `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}tr`
    : `${Math.round(amount / 1000)}K`;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Ngày theo giờ máy người dùng, dạng YYYY-MM-DD (đúng định dạng backend cần). */
export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const fromDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const WEEKDAYS_SHORT = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'];
const WEEKDAYS_LONG = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export const weekdayShort = (date: Date): string => WEEKDAYS_SHORT[date.getDay()];

/** "2026-10-08" → "Thứ năm, 08/10/2026" */
export const formatDateLong = (key: string): string => {
  const date = fromDateKey(key);
  return `${WEEKDAYS_LONG[date.getDay()]}, ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const timeToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const formatDuration = (hours: number): string => {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (!whole) return `${minutes} phút`;
  return minutes ? `${whole} giờ ${minutes} phút` : `${whole} giờ`;
};

/** Thời gian tương đối: "5 phút trước", "2 ngày trước"… */
export const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return '?';
  const last = parts[parts.length - 1];
  return parts.length === 1 ? last[0].toUpperCase() : `${parts[0][0]}${last[0]}`.toUpperCase();
};

/** Màu avatar ổn định theo tên. */
const AVATAR_GRADIENTS = [
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-indigo-600',
  'from-orange-400 to-rose-600',
  'from-fuchsia-400 to-purple-600',
  'from-amber-400 to-orange-600',
  'from-lime-400 to-emerald-600',
];

export const avatarGradient = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};

export const cn = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ');
