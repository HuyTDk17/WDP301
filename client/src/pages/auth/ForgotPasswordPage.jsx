import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Link, Stack, TextField } from '@mui/material';
import AuthCard from '../../components/common/AuthCard.jsx';
import { authApi } from '../../services/api/authApi.js';
import { isEmail } from '../../utils/validators.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!isEmail(email)) return setError('Email không hợp lệ.');
    setSubmitting(true);
    setError('');
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Quên mật khẩu" subtitle="Nhập email để nhận liên kết đặt lại mật khẩu.">
      {sent ? (
        <Alert severity="success">Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.</Alert>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
            <Button type="submit" variant="contained" size="large" disabled={submitting}>{submitting ? 'Đang gửi…' : 'Gửi liên kết'}</Button>
          </Stack>
        </form>
      )}
      <Link component={RouterLink} to="/login" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>Quay lại đăng nhập</Link>
    </AuthCard>
  );
}
