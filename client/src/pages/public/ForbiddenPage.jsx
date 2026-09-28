import { Link as RouterLink } from 'react-router-dom';
import { Button, Container, Typography } from '@mui/material';

export default function ForbiddenPage() {
  return (
    <Container maxWidth="sm" sx={{ textAlign: 'center', py: 10 }}>
      <Typography variant="h3" gutterBottom>403</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Bạn không có quyền truy cập trang này.</Typography>
      <Button component={RouterLink} to="/" variant="contained">Về trang chủ</Button>
    </Container>
  );
}
