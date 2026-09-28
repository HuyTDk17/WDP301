import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Button, CircularProgress } from '@mui/material';
import AuthCard from '../../components/common/AuthCard.jsx';
import { authApi } from '../../services/api/authApi.js';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState({ status: token ? 'loading' : 'error', message: token ? '' : 'Liên kết xác thực không hợp lệ.' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authApi
      .verifyEmail(token)
      .then(() => !cancelled && setState({ status: 'success', message: 'Xác thực email thành công. Bạn có thể đăng nhập.' }))
      .catch((err) => !cancelled && setState({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthCard title="Xác thực email">
      {state.status === 'loading' && <CircularProgress aria-label="Đang xác thực" />}
      {state.status !== 'loading' && (
        <>
          <Alert severity={state.status === 'success' ? 'success' : 'error'} sx={{ mb: 2 }}>{state.message}</Alert>
          <Button component={RouterLink} to="/login" variant="contained" fullWidth>Về trang đăng nhập</Button>
        </>
      )}
    </AuthCard>
  );
}
