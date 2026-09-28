import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Link, Stack, TextField } from '@mui/material';
import AuthCard from '../../components/common/AuthCard.jsx';
import { authApi } from '../../services/api/authApi.js';
import { MSG } from '../../constants/messages.js';
import { PASSWORD_HINT, isEmail, isValidPassword } from '../../utils/validators.js';

const INITIAL = { fullName: '', email: '', password: '', confirmPassword: '' };

export default function RegisterPage() {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const validate = () => {
    const next = {};
    if (!values.fullName.trim()) next.fullName = 'Vui lòng nhập họ tên.';
    if (!isEmail(values.email)) next.email = 'Email không hợp lệ.';
    if (!isValidPassword(values.password)) next.password = PASSWORD_HINT;
    if (values.confirmPassword !== values.password) next.confirmPassword = MSG['MSG-AUTH-02'];
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    setServerError('');
    try {
      await authApi.register({ ...values, fullName: values.fullName.trim(), email: values.email.trim() });
      setDone(true);
    } catch (err) {
      setServerError(err.message);
      setErrors(err.fieldErrors || {});
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="Kiểm tra email của bạn">
        <Alert severity="success" sx={{ mb: 2 }}>{MSG['MSG-AUTH-03']}</Alert>
        <Button component={RouterLink} to="/login" variant="contained" fullWidth>Về trang đăng nhập</Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Tạo tài khoản">
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField label="Họ và tên" name="fullName" autoComplete="name" value={values.fullName} onChange={handleChange} error={Boolean(errors.fullName)} helperText={errors.fullName} disabled={submitting} />
          <TextField label="Email" name="email" type="email" autoComplete="email" value={values.email} onChange={handleChange} error={Boolean(errors.email)} helperText={errors.email} disabled={submitting} />
          <TextField label="Mật khẩu" name="password" type="password" autoComplete="new-password" value={values.password} onChange={handleChange} error={Boolean(errors.password)} helperText={errors.password || PASSWORD_HINT} disabled={submitting} />
          <TextField label="Xác nhận mật khẩu" name="confirmPassword" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={handleChange} error={Boolean(errors.confirmPassword)} helperText={errors.confirmPassword} disabled={submitting} />
          <Button type="submit" variant="contained" size="large" disabled={submitting}>{submitting ? 'Đang đăng ký…' : 'Đăng ký'}</Button>
          <Link component={RouterLink} to="/login" sx={{ textAlign: 'center' }}>Đã có tài khoản? Đăng nhập</Link>
        </Stack>
      </form>
    </AuthCard>
  );
}
