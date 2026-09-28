import { Link as RouterLink } from 'react-router-dom';
import { Button, Container, Typography } from '@mui/material';

export default function NotFoundPage() {
  return (
    <Container maxWidth="sm" sx={{ textAlign: 'center', py: 10 }}>
      <Typography variant="h3" gutterBottom>404</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Không tìm thấy trang bạn yêu cầu.</Typography>
      <Button component={RouterLink} to="/" variant="contained">Về trang chủ</Button>
    </Container>
  );
}
