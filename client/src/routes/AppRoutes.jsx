import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout.jsx';
import CustomerLayout from '../layouts/CustomerLayout.jsx';
import OwnerLayout from '../layouts/OwnerLayout.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import RoleRoute from './RoleRoute.jsx';
import ComingSoon from '../components/common/ComingSoon.jsx';
import HomePage from '../pages/public/HomePage.jsx';
import NotFoundPage from '../pages/public/NotFoundPage.jsx';
import ForbiddenPage from '../pages/public/ForbiddenPage.jsx';
import LoginPage from '../pages/auth/LoginPage.jsx';
import RegisterPage from '../pages/auth/RegisterPage.jsx';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage.jsx';
import VerifyEmailPage from '../pages/auth/VerifyEmailPage.jsx';
import { ROLE_MENUS } from '../constants/roleMenus.jsx';

// Route con của từng vai trò: lấy từ ROLE_MENUS; menu chưa có `element` thì dùng trang giữ chỗ.
const renderRoleRoutes = (role) => [
  ...ROLE_MENUS[role].map((item) => (
    <Route key={item.path} index={item.path === ''} path={item.path || undefined} element={item.element ?? <ComingSoon title={item.label} fr={item.fr} />} />
  )),
  <Route key="profile" path="profile" element={<ComingSoon title="Hồ sơ cá nhân" fr="FR 1.4–1.6" />} />,
  <Route key="notifications" path="notifications" element={<ComingSoon title="Thông báo" fr="FR 1.7–1.8" />} />,
];

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="fields" element={<ComingSoon title="Tìm kiếm sân" fr="FR 5.1" />} />
        <Route path="fields/:fieldId" element={<ComingSoon title="Chi tiết sân" fr="FR 5.2" />} />
        <Route path="news" element={<ComingSoon title="Tin tức" fr="FR 2.5" />} />
        <Route path="policies" element={<ComingSoon title="Chính sách" fr="FR 2.6" />} />
        <Route path="403" element={<ForbiddenPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute roles={['customer']} />}>
          <Route path="customer" element={<CustomerLayout />}>
            <Route index element={<Navigate to="search" replace />} />
            {renderRoleRoutes('customer')}
          </Route>
        </Route>
        <Route element={<RoleRoute roles={['owner']} />}>
          <Route path="owner" element={<OwnerLayout />}>{renderRoleRoutes('owner')}</Route>
        </Route>
        <Route element={<RoleRoute roles={['admin']} />}>
          <Route path="admin" element={<AdminLayout />}>{renderRoleRoutes('admin')}</Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
