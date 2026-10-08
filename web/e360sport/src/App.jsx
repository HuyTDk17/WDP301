import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthProvider'
import { ToastProvider } from '@/contexts/ToastContext'
import { BookingProvider } from '@/contexts/BookingContext'
import AppRoutes from '@/routes/AppRoutes'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <BookingProvider>
            <AppRoutes />
          </BookingProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
