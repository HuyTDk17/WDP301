import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from '../lib/api';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Gọi API theo `deps`, tự huỷ request cũ khi deps đổi / component unmount.
 * Truyền `enabled = false` để tạm chưa gọi (ví dụ chưa đăng nhập).
 */
export function useAsync<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  enabled = true
): AsyncState<T> & { reload: () => void; setData: (updater: (prev: T | null) => T | null) => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: enabled, error: null });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.friendly : 'Đã có lỗi xảy ra, vui lòng thử lại.';
        setState({ data: null, loading: false, error: message });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback(
    (updater: (prev: T | null) => T | null) => setState((prev) => ({ ...prev, data: updater(prev.data) })),
    []
  );

  return { ...state, reload, setData };
}
