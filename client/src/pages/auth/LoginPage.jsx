import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Link, Stack, TextField } from '@mui/material';
import AuthCard from '../../components/common/AuthCard.jsx';
import useAuth from '../../hooks/useAuth.js';
import { login } from '../../store/slices/authSlice.js';
import { ROLE_HOME } from '../../constants/roles.js';
import { MSG } from '../../constants/messages.js';
import { isEmail } from '../../utils/validators.js';
import useSnackbar from '../../hooks/useSnackbar.js';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const snackbar = useSnackbar();
  const { isAuthenticated, role } = useAuth();
  const submitting = useSelector((s) => s.auth.loginStatus === 'loading');
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');

  if (isAuthenticated) return <Navigate to={ROLE_HOME[role]} replace />;

  const validate = () => {
    const next = {};
    if (!isEmail(values.email)) next.email = 'Email không hợp lệ.';
    if (!values.password) next.password = 'Vui lòng nhập mật khẩu.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !validate()) return;
    setServerError('');
    const result = await dispatch(login({ email: values.email.trim(), password: values.password }));
    if (login.fulfilled.match(result)) {
      snackbar.success(MSG['MSG-AUTH-06']);
      const from = location.state?.from?.pathname;
      navigate(from || ROLE_HOME[result.payload.role], { replace: true });
    } else {
      setServerError(result.payload?.message);
    }
  };

  return (
    <AuthCard title="Đăng nhập" subtitle="Chào mừng bạn quay lại.">
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField label="Email" name="email" type="email" autoComplete="email" value={values.email} onChange={handleChange} error={Boolean(errors.email)} helperText={errors.email} disabled={submitting} />
          <TextField label="Mật khẩu" name="password" type="password" autoComplete="current-password" value={values.password} onChange={handleChange} error={Boolean(errors.password)} helperText={errors.password} disabled={submitting} />
          <Button type="submit" variant="contained" size="large" disabled={submitting}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
          <Stack direction="row" justifyContent="space-between">
            <Link component={RouterLink} to="/forgot-password">Quên mật khẩu?</Link>
            <Link component={RouterLink} to="/register">Tạo tài khoản</Link>
          </Stack>
        </Stack>
      </form>
    </AuthCard>
  );
}
