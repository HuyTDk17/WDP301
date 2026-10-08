import type { BookingStatus } from './api';

export interface SportMeta {
  key: string;
  label: string;
  emoji: string;
  /** Lớp Tailwind cho nền gradient của thẻ môn thể thao. */
  gradient: string;
}

export const SPORTS: SportMeta[] = [
  { key: 'football', label: 'Bóng đá', emoji: '⚽', gradient: 'from-emerald-500 to-green-700' },
  { key: 'badminton', label: 'Cầu lông', emoji: '🏸', gradient: 'from-sky-500 to-indigo-600' },
  { key: 'tennis', label: 'Tennis', emoji: '🎾', gradient: 'from-lime-500 to-emerald-600' },
  { key: 'basketball', label: 'Bóng rổ', emoji: '🏀', gradient: 'from-orange-500 to-rose-600' },
  { key: 'volleyball', label: 'Bóng chuyền', emoji: '🏐', gradient: 'from-amber-400 to-orange-600' },
  { key: 'swimming', label: 'Bơi lội', emoji: '🏊', gradient: 'from-cyan-400 to-blue-600' },
  { key: 'gym', label: 'Gym', emoji: '🏋️', gradient: 'from-slate-600 to-slate-900' },
  { key: 'yoga', label: 'Yoga', emoji: '🧘', gradient: 'from-fuchsia-500 to-purple-700' },
];

const SPORT_MAP = new Map(SPORTS.map((s) => [s.key, s]));

export const sportMeta = (key: string): SportMeta =>
  SPORT_MAP.get(key) ?? { key, label: key, emoji: '🏟️', gradient: 'from-brand-500 to-brand-700' };

/** Thành phố → quận/huyện có sân trong dữ liệu. */
export const CITIES: Record<string, string[]> = {
  'TP. Hồ Chí Minh': [
    'Bình Thạnh', 'Thủ Đức', 'Quận 1', 'Quận 3', 'Quận 7', 'Quận 10', 'Quận 12', 'Phú Nhuận', 'Gò Vấp', 'Tân Bình',
  ],
  'Hà Nội': [
    'Đống Đa', 'Nam Từ Liêm', 'Tây Hồ', 'Cầu Giấy', 'Long Biên', 'Hai Bà Trưng', 'Hoàng Mai', 'Thanh Xuân',
  ],
  'Hải Phòng': ['Hải An', 'Hồng Bàng', 'Ngô Quyền', 'Lê Chân'],
  'Đà Nẵng': ['Sơn Trà', 'Cẩm Lệ', 'Thanh Khê', 'Ngũ Hành Sơn'],
  'Cần Thơ': ['Ninh Kiều', 'Cái Răng'],
};

export const CITY_NAMES = Object.keys(CITIES);

export const CITY_IMAGES: Record<string, string> = {
  'TP. Hồ Chí Minh': 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=900&q=80',
  'Hà Nội': 'https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?auto=format&fit=crop&w=900&q=80',
  'Hải Phòng': 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=80',
  'Đà Nẵng': 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=900&q=80',
  'Cần Thơ': 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=900&q=80',
};

export const AMENITY_EMOJI: Record<string, string> = {
  'Bãi đỗ xe': '🅿️',
  'Cho thuê dụng cụ': '🎽',
  'Cho thuê vợt': '🏸',
  'Huấn luyện viên': '🧑‍🏫',
  'Máy lạnh': '❄️',
  'Phòng thay đồ': '🚪',
  'Quầy giải khát': '🥤',
  'Quầy nước': '💧',
  'Tủ khoá': '🔐',
  'Vòi sen': '🚿',
  WiFi: '📶',
  'Đèn chiếu sáng': '💡',
};

export const STATUS_META: Record<BookingStatus, { label: string; className: string; dot: string }> = {
  confirmed: {
    label: 'Đã xác nhận',
    className: 'bg-brand-500/12 text-brand-700 dark:text-brand-300 ring-brand-500/25',
    dot: 'bg-brand-500',
  },
  awaiting_payment: {
    label: 'Chờ thanh toán',
    className: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25',
    dot: 'bg-amber-500',
  },
  completed: {
    label: 'Đã hoàn thành',
    className: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25',
    dot: 'bg-sky-500',
  },
  cancelled: {
    label: 'Đã huỷ',
    className: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25',
    dot: 'bg-rose-500',
  },
  no_show: {
    label: 'Vắng mặt',
    className: 'bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25',
    dot: 'bg-slate-400',
  },
};

export const ROLE_LABEL: Record<string, string> = {
  customer: 'Người chơi',
  owner: 'Chủ sân',
  admin: 'Quản trị viên',
};

export const PAYMENT_LABEL: Record<string, string> = {
  bank_transfer: 'Chuyển khoản ngân hàng',
  cash: 'Tiền mặt',
  credit: 'Số dư tài khoản',
  vnpay: 'VNPay',
  momo: 'MoMo',
};
