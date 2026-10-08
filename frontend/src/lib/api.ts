// Lớp gọi API tới backend E360Sport (`/api/v1`, proxy qua Vite khi dev).

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
const TOKEN_KEY = 'e360_token';

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* bỏ qua: trình duyệt chặn localStorage */
    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  details: FieldError[];

  constructor(status: number, message: string, details: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** Thông báo đầy đủ: ưu tiên lỗi từng field nếu backend trả về. */
  get friendly(): string {
    return this.details.length ? this.details.map((d) => d.message).join(' · ') : this.message;
  }
}

/** Được AuthContext gán để tự đăng xuất khi token hết hạn. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  onUnauthorized = handler;
};

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

const buildUrl = (path: string, query?: Query): string => {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Không kết nối được máy chủ. Hãy kiểm tra backend đang chạy ở cổng 3000.');
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    if (response.status === 401 && token) onUnauthorized?.();
    throw new ApiError(
      response.status,
      payload?.message ?? `Máy chủ trả về lỗi ${response.status}`,
      Array.isArray(payload?.details) ? payload.details : []
    );
  }

  return payload.data as T;
}

// ── Kiểu dữ liệu ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'owner' | 'admin' | string;
  avatar?: string;
  creditBalance?: number;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface Address {
  street: string;
  district: string;
  city: string;
}

export interface OpenHours {
  open: string;
  close: string;
}

export interface Venue {
  id: string;
  name: string;
  description: string;
  sports: string[];
  address: Address;
  amenities: string[];
  images: string[];
  openHours: OpenHours;
  rating: number;
  reviewCount: number;
  minPrice: number | null;
  /** Số sân con khớp bộ lọc giá / giờ trống (null khi không lọc). */
  matchingCourts?: number | null;
}

export interface Court {
  id: string;
  name: string;
  type: string;
  size: string;
  surface: string;
  pricePerHour: number;
}

export interface CancellationTier {
  minLeadHours: number;
  refundRate: number;
}

export interface VenueDetail extends Venue {
  rules: string;
  cancellationPolicy: CancellationTier[];
  transferRequiresApproval: boolean;
  courts: Court[];
}

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface Slot {
  start: string;
  end: string;
  available: boolean;
}

export interface Availability {
  courtId: string;
  courtName: string;
  date: string;
  openHours: OpenHours;
  slots: Slot[];
}

export type BookingStatus = 'awaiting_payment' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface BookingSummary {
  id: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  amount: number;
  status: BookingStatus;
  transferCount?: number;
}

export interface BookingDetail extends BookingSummary {
  duration: number;
  sport: string;
  serviceFee?: number;
  ownerCommission?: number;
  paymentMethod?: string;
  cancellationReason?: string;
  refundAmount?: number;
  cancellationFee?: number;
  createdAt: string;
  updatedAt?: string;
  venueId: string;
  venueAddress: Address | null;
  customer: { name: string; email: string; phone: string } | null;
  notes?: string;
  discountAmount?: number;
  creditApplied?: number;
}

export interface CancellationQuote {
  cancellable: boolean;
  reason: string | null;
  leadHours: number;
  refundRate: number;
  refundAmount: number;
  cancellationFee: number;
  tiers: CancellationTier[];
}

export interface Profile {
  user: User & {
    status: string;
    bio: string;
    city: string;
    creditBalance: number;
    emailVerified: boolean;
    authProvider: string;
    ownerApplicationStatus: string;
    businessName: string;
    createdAt: string;
  };
  stats: {
    totalBookings: number;
    confirmedBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    totalSpent: number;
    favorites: number;
    reviews: number;
  };
}

export interface Review {
  id: string;
  rating: number;
  comment: string;
  helpful: number;
  createdAt: string;
  user: { _id: string; name: string; avatar?: string } | null;
}

export interface FavoriteVenue {
  _id: string;
  name: string;
  address: Address;
  images: string[];
  rating: number;
  reviewCount: number;
}

export interface NotificationItem {
  id: string;
  type: string;
  icon: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  total: number;
  unread: number;
  items: NotificationItem[];
}

export interface VenueQuery {
  q?: string;
  sport?: string;
  city?: string;
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Lọc giờ trống: cần đủ date + startTime + endTime. */
  date?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}

// ── Endpoint ──────────────────────────────────────────────────────────────

export const api = {
  login: (body: { email: string; password: string }) =>
    request<AuthResult>('/auth/login', { method: 'POST', body }),
  register: (body: { name: string; email: string; phone: string; password: string; role: 'customer' | 'owner' }) =>
    request<AuthResult>('/auth/register', { method: 'POST', body }),
  me: (signal?: AbortSignal) => request<{ user: User }>('/auth/me', { signal }),
  profile: (signal?: AbortSignal) => request<Profile>('/auth/profile', { signal }),

  venues: (query: VenueQuery, signal?: AbortSignal) =>
    request<Paged<Venue>>('/venues', { query: { ...query }, signal }),
  venue: (id: string, signal?: AbortSignal) => request<VenueDetail>(`/venues/${id}`, { signal }),
  availability: (venueId: string, courtId: string, date: string, signal?: AbortSignal) =>
    request<Availability>(`/venues/${venueId}/courts/${courtId}/availability`, { query: { date }, signal }),

  createBooking: (body: { courtId: string; date: string; startTime: string; endTime: string; notes?: string }) =>
    request<BookingSummary>('/bookings', { method: 'POST', body }),
  bookings: (query: { status?: BookingStatus; page?: number; pageSize?: number }, signal?: AbortSignal) =>
    request<Paged<BookingSummary>>('/bookings', { query, signal }),
  booking: (id: string, signal?: AbortSignal) => request<BookingDetail>(`/bookings/${id}`, { signal }),
  cancellationQuote: (id: string, signal?: AbortSignal) =>
    request<CancellationQuote>(`/bookings/${id}/cancellation-quote`, { signal }),
  cancelBooking: (id: string, reason?: string) =>
    request<{ id: string; status: BookingStatus; cancellationReason: string; refundAmount: number; cancellationFee: number }>(`/bookings/${id}/cancel`, {
      method: 'POST',
      body: reason ? { reason } : {},
    }),

  reviews: (venueId: string, signal?: AbortSignal) => request<Review[]>(`/venues/${venueId}/reviews`, { signal }),
  createReview: (body: { venueId: string; rating: number; comment?: string }) =>
    request<{ id: string; rating: number; comment: string }>('/reviews', { method: 'POST', body }),

  favorites: (signal?: AbortSignal) => request<(FavoriteVenue | null)[]>('/favorites', { signal }),
  addFavorite: (venueId: string) =>
    request<{ id: string; alreadyFavorited: boolean }>('/favorites', { method: 'POST', body: { venueId } }),
  removeFavorite: (venueId: string) =>
    request<{ removed: boolean }>(`/favorites/${venueId}`, { method: 'DELETE' }),

  notifications: (unreadOnly = false, signal?: AbortSignal) =>
    request<NotificationList>('/notifications', { query: { unreadOnly: unreadOnly || undefined }, signal }),
  markNotificationsRead: (body: { ids?: string[]; all?: boolean }) =>
    request<{ updated: number }>('/notifications/read', { method: 'POST', body }),
};
