import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes.jsx';
import { logout, restoreSession } from './store/slices/authSlice.js';
import { clearNotifications } from './store/slices/notificationSlice.js';
import { setUnauthorizedHandler } from './services/axiosClient.js';
import useSnackbar from './hooks/useSnackbar.js';

export default function App() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const snackbar = useSnackbar();

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  // 401 từ bất kỳ API nào (khi đang có token) => hết phiên.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      dispatch(logout());
      dispatch(clearNotifications());
      snackbar.warning('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      navigate('/login', { replace: true });
    });
  }, [dispatch, navigate, snackbar]);

  return <AppRoutes />;
}
