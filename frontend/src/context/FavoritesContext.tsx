import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type FavoriteVenue } from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface FavoritesApi {
  items: FavoriteVenue[];
  loading: boolean;
  isFavorite: (venueId: string) => boolean;
  /** Bật/tắt yêu thích; tự chuyển sang trang đăng nhập nếu chưa đăng nhập. */
  toggle: (venue: { id: string; name: string }) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesApi | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<FavoriteVenue[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const list = await api.favorites(signal);
    // Sân đã bị xoá sẽ populate ra null → bỏ qua.
    setItems(list.filter((v): v is FavoriteVenue => !!v));
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user, load]);

  const ids = useMemo(() => new Set(items.map((v) => v._id)), [items]);

  const toggle = useCallback(
    async (venue: { id: string; name: string }) => {
      if (!user) {
        toast.info('Đăng nhập để lưu sân yêu thích nhé!');
        navigate('/login', { state: { from: location.pathname + location.search } });
        return;
      }

      const wasFavorite = ids.has(venue.id);
      try {
        if (wasFavorite) {
          setItems((list) => list.filter((v) => v._id !== venue.id));
          await api.removeFavorite(venue.id);
          toast.info(`Đã bỏ "${venue.name}" khỏi yêu thích`);
        } else {
          await api.addFavorite(venue.id);
          await load();
          toast.success(`Đã lưu "${venue.name}" vào yêu thích`);
        }
      } catch (error) {
        await load().catch(() => undefined);
        toast.error(error instanceof ApiError ? error.friendly : 'Không cập nhật được yêu thích');
      }
    },
    [user, ids, toast, navigate, location.pathname, location.search, load]
  );

  const value = useMemo<FavoritesApi>(
    () => ({ items, loading, isFavorite: (id) => ids.has(id), toggle }),
    [items, loading, ids, toggle]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export const useFavorites = (): FavoritesApi => {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites phải nằm trong FavoritesProvider');
  return ctx;
};
