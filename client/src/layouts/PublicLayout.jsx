import { Link as RouterLink, Outlet, useNavigate } from 'react-router-dom';
import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import useAuth from '../hooks/useAuth.js';
import { ROLE_HOME } from '../constants/roles.js';

export default function PublicLayout() {
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" color="primary" component={RouterLink} to="/" sx={{ textDecoration: 'none', flexGrow: 1 }}>
            Đặt sân thể thao
          </Typography>
          <Button component={RouterLink} to="/fields" color="inherit">Tìm sân</Button>
          <Button component={RouterLink} to="/news" color="inherit">Tin tức</Button>
          <Button component={RouterLink} to="/policies" color="inherit">Chính sách</Button>
          {isAuthenticated ? (
            <Button variant="contained" onClick={() => navigate(ROLE_HOME[role])}>Vào trang của tôi</Button>
          ) : (
            <>
              <Button component={RouterLink} to="/login">Đăng nhập</Button>
              <Button component={RouterLink} to="/register" variant="contained">Đăng ký</Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
