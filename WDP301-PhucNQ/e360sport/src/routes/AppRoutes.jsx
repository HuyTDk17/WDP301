import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/authState'

import CustomerLayout from '@/layouts/CustomerLayout/CustomerLayout'
import OwnerLayout from '@/layouts/OwnerLayout/OwnerLayout'
import AdminLayout from '@/layouts/AdminLayout/AdminLayout'
import AuthLayout from '@/layouts/AuthLayout/AuthLayout'

import Login from '@/pages/auth/Login/Login'
import Register from '@/pages/auth/Register/Register'
import ForgotPassword from '@/pages/auth/ForgotPassword/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword/ResetPassword'
import VerifyEmail from '@/pages/auth/VerifyEmail/VerifyEmail'

import Home from '@/pages/customer/Home/Home'
import VenueListing from '@/pages/customer/VenueListing/VenueListing'
import VenueDetail from '@/pages/customer/VenueDetail/VenueDetail'
import Booking from '@/pages/customer/Booking/Booking'
import Payment from '@/pages/customer/Payment/Payment'
import BookingHistory from '@/pages/customer/BookingHistory/BookingHistory'
import TransferBooking from '@/pages/customer/TransferBooking/TransferBooking'
import TransferDetail from '@/pages/customer/TransferDetail/TransferDetail'
import ClaimBooking from '@/pages/customer/ClaimBooking/ClaimBooking'
import FavoriteVenues from '@/pages/customer/FavoriteVenues/FavoriteVenues'
import Profile from '@/pages/customer/Profile/Profile'
import Notifications from '@/pages/customer/Notifications/Notifications'
import LegalPage from '@/pages/legal/LegalPage'
import OwnerApplication from '@/pages/customer/OwnerApplication/OwnerApplication'

import OwnerDashboard from '@/pages/owner/OwnerDashboard/OwnerDashboard'
import BookingCalendar from '@/pages/owner/BookingCalendar/BookingCalendar'
import ManageVenues from '@/pages/owner/ManageVenues/ManageVenues'
import AddVenue from '@/pages/owner/AddVenue/AddVenue'
import EditVenue from '@/pages/owner/EditVenue/EditVenue'
import CourtManagement from '@/pages/owner/CourtManagement/CourtManagement'
import ManageBookings from '@/pages/owner/ManageBookings/ManageBookings'
import Revenue from '@/pages/owner/Revenue/Revenue'
import TransferRequests from '@/pages/owner/TransferRequests/TransferRequests'
import Customers from '@/pages/owner/Customers/Customers'
import OwnerSettings from '@/pages/owner/OwnerSettings/OwnerSettings'

import AdminDashboard from '@/pages/admin/AdminDashboard/AdminDashboard'
import UserManagement from '@/pages/admin/UserManagement/UserManagement'
import VenueManagement from '@/pages/admin/VenueManagement/VenueManagement'
import OwnerManagement from '@/pages/admin/OwnerManagement/OwnerManagement'
import OwnerDetail from '@/pages/admin/OwnerDetail/OwnerDetail'
import ReviewModeration from '@/pages/admin/ReviewModeration/ReviewModeration'
import CommissionReport from '@/pages/admin/CommissionReport/CommissionReport'
import OwnerPendingBankPayments from '@/pages/owner/PendingBankPayments/PendingBankPayments'
import OwnerCommission from '@/pages/owner/Commission/Commission'
import OwnerRefundRequests from '@/pages/owner/RefundRequests/RefundRequests'
import AdminSettlements from '@/pages/admin/Settlements/Settlements'
import RevenueReports from '@/pages/admin/RevenueReports/RevenueReports'
import AdminSettings from '@/pages/admin/AdminSettings/AdminSettings'

import Forbidden from '@/pages/error/Forbidden/Forbidden'
import NotFound from '@/pages/error/NotFound/NotFound'

import Spinner from '@/components/ui/Spinner/Spinner'

const ROLE_HOME = { customer: '/', owner: '/owner/dashboard', admin: '/admin/dashboard' }

function FullPageSpinner() {
  return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner size="lg" /></div>
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/403" replace />
  return children
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (user) return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  return children
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
        <Route path="/reset-password/:token" element={<GuestRoute><ResetPassword /></GuestRoute>} />
        {/* KHÔNG bọc GuestRoute — xem ghi chú đầu VerifyEmail.jsx */}
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
      </Route>

      <Route element={<CustomerLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/venues" element={<VenueListing />} />
        <Route path="/venues/:id" element={<VenueDetail />} />
        <Route path="/booking/:venueId" element={<ProtectedRoute roles={['customer']}><Booking /></ProtectedRoute>} />
        <Route path="/payment" element={<ProtectedRoute roles={['customer']}><Payment /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute roles={['customer']}><BookingHistory /></ProtectedRoute>} />
        <Route path="/bookings/:bookingId/transfer" element={<ProtectedRoute roles={['customer']}><TransferBooking /></ProtectedRoute>} />
        {/* Cũng là địa chỉ cổng thanh toán chuyển hướng về sau khi khách trả khoản chênh lệch */}
        <Route path="/transfers/:id" element={<ProtectedRoute roles={['customer']}><TransferDetail /></ProtectedRoute>} />
        {/* Nhận suất bằng mã sang tên. Dạng có sẵn mã để chia sẻ link trực tiếp. */}
        <Route path="/claim" element={<ProtectedRoute roles={['customer']}><ClaimBooking /></ProtectedRoute>} />
        <Route path="/claim/:code" element={<ProtectedRoute roles={['customer']}><ClaimBooking /></ProtectedRoute>} />
        <Route path="/favorites" element={<ProtectedRoute roles={['customer']}><FavoriteVenues /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/owner-application" element={<ProtectedRoute roles={['customer', 'owner']}><OwnerApplication /></ProtectedRoute>} />
        <Route path="/privacy-policy" element={<LegalPage type="privacy" />} />
        <Route path="/terms-of-service" element={<LegalPage type="terms" />} />
        <Route path="/403" element={<Forbidden />} />
      </Route>

      <Route path="/owner" element={<ProtectedRoute roles={['owner']}><OwnerLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/owner/dashboard" replace />} />
        <Route path="dashboard" element={<OwnerDashboard />} />
        <Route path="calendar" element={<BookingCalendar />} />
        <Route path="venues" element={<ManageVenues />} />
        <Route path="venues/create" element={<AddVenue />} />
        <Route path="venues/:id/edit" element={<EditVenue />} />
        <Route path="courts" element={<CourtManagement />} />
        <Route path="bookings" element={<ManageBookings />} />
        <Route path="payments/pending" element={<OwnerPendingBankPayments />} />
        <Route path="commission" element={<OwnerCommission />} />
        <Route path="refunds" element={<OwnerRefundRequests />} />
        <Route path="transfers" element={<TransferRequests />} />
        <Route path="customers" element={<Customers />} />
        <Route path="revenue" element={<Revenue />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<OwnerSettings />} />
      </Route>

      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="venues" element={<VenueManagement />} />
        <Route path="owners" element={<OwnerManagement />} />
        <Route path="owners/:id" element={<OwnerDetail />} />
        <Route path="reviews" element={<ReviewModeration />} />
        <Route path="commissions" element={<CommissionReport />} />
        <Route path="settlements" element={<AdminSettlements />} />
        <Route path="reports" element={<RevenueReports />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
