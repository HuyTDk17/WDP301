import { useSelector } from 'react-redux';

export default function useAuth() {
  const { user, initialized } = useSelector((state) => state.auth);
  return { user, role: user?.role ?? null, isAuthenticated: Boolean(user), initialized };
}
