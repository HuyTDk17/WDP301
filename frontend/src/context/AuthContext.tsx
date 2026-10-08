import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore, type AuthResult, type User } from '../lib/api';

interface AuthApi {
  user: User | null;
  /** true khi đang kiểm tra token đã lưu lúc mở trang. */
  booting: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: 'customer' | 'owner';
  }) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState<boolean>(() => !!tokenStore.get());

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // Khôi phục phiên đăng nhập từ token đã lưu.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return () => setUnauthorizedHandler(null);

    const controller = new AbortController();
    api
      .me(controller.signal)
      .then(({ user: me }) => setUser(me))
      .catch(() => {
        if (!controller.signal.aborted) tokenStore.clear();
      })
      .finally(() => {
        if (!controller.signal.aborted) setBooting(false);
      });

    return () => {
      controller.abort();
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  const accept = useCallback((result: AuthResult): User => {
    tokenStore.set(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      user,
      booting,
      login: async (email, password) => accept(await api.login({ email, password })),
      register: async (input) => accept(await api.register(input)),
      logout,
    }),
    [user, booting, accept, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthApi => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
};
