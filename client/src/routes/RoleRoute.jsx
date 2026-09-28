import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';

export default function RoleRoute({ roles }) {
  const { role } = useAuth();
  if (!roles.includes(role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
