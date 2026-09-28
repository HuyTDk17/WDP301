import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import FullScreenLoader from '../components/common/FullScreenLoader.jsx';

// Chỉ là lớp UX; backend vẫn là nơi cưỡng chế quyền.
export default function ProtectedRoute() {
  const { isAuthenticated, initialized } = useAuth();
  const location = useLocation();
  if (!initialized) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
