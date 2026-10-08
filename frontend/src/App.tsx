import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { ToastProvider } from './context/ToastContext';
import Layout, { PageHeader } from './components/Layout';
import { ButtonLink, Spinner } from './components/ui';
import Home from './pages/Home';
import Venues from './pages/Venues';
import VenueDetail from './pages/VenueDetail';
import Bookings from './pages/Bookings';
import Favorites from './pages/Favorites';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Invoice from './pages/Invoice';
import { Login, Register } from './pages/Auth';

/** Chặn trang cần đăng nhập; nhớ lại trang đang vào để quay về sau khi đăng nhập. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="pt-32">
        <Spinner label="Đang kiểm tra phiên đăng nhập…" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <>
      <PageHeader eyebrow="Lỗi 404" title="Bóng đã ra ngoài sân! ⚽" description="Trang bạn tìm không tồn tại hoặc đã được chuyển đi." />
      <div className="container-page flex justify-center gap-3 py-16">
        <ButtonLink to="/">Về trang chủ</ButtonLink>
        <ButtonLink to="/venues" variant="secondary">
          Tìm sân
        </ButtonLink>
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <FavoritesProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="/venues" element={<Venues />} />
                <Route path="/venues/:id" element={<VenueDetail />} />
                <Route path="/bookings" element={<RequireAuth><Bookings /></RequireAuth>} />
                <Route path="/bookings/:id/invoice" element={<RequireAuth><Invoice /></RequireAuth>} />
                <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
                <Route path="/favorites" element={<RequireAuth><Favorites /></RequireAuth>} />
                <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </FavoritesProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
