import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Button, Stack, TextField } from '@mui/material';
import AuthCard from '../../components/common/AuthCard.jsx';
import { authApi } from '../../services/api/authApi.js';
import { MSG } from '../../constants/messages.js';
import { PASSWORD_HINT, isValidPassword } from '../../utils/validators.js';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [values, setValues] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthCard title="Đặt lại mật khẩu">
        <Alert severity="error">{MSG['MSG-AUTH-07']}</Alert>
      </AuthCard>
    );
  }

  const handleChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const next = {};
    if (!isValidPassword(values.newPassword)) next.newPassword = PASSWORD_HINT;
    if (values.confirmPassword !== values.newPassword) next.confirmPassword = MSG['MSG-AUTH-02'];
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    setServerError('');
    try {
      await authApi.resetPassword({ token, ...values });
      setDone(true);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="Đặt lại mật khẩu">
        <Alert severity="success" sx={{ mb: 2 }}>{MSG['MSG-AUTH-08']}</Alert>
        <Button component={RouterLink} to="/login" variant="contained" fullWidth>Đăng nhập</Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Đặt lại mật khẩu">
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField label="Mật khẩu mới" name="newPassword" type="password" autoComplete="new-password" value={values.newPassword} onChange={handleChange} error={Boolean(errors.newPassword)} helperText={errors.newPassword || PASSWORD_HINT} disabled={submitting} />
          <TextField label="Xác nhận mật khẩu mới" name="confirmPassword" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={handleChange} error={Boolean(errors.confirmPassword)} helperText={errors.confirmPassword} disabled={submitting} />
          <Button type="submit" variant="contained" size="large" disabled={submitting}>{submitting ? 'Đang xử lý…' : 'Đặt lại mật khẩu'}</Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
