import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';

// Banner / tin nổi bật (FR 2.4, 2.5) sẽ được nối API ở Phase 3.
export default function HomePage() {
  return (
    <Box sx={{ textAlign: 'center', py: { xs: 4, md: 10 } }}>
      <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 2 }}>Tìm và đặt sân thể thao gần bạn</Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>Chọn sân, chọn khung giờ, thanh toán trực tuyến hoặc tại sân.</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
        <Button component={RouterLink} to="/fields" variant="contained" size="large">Tìm sân ngay</Button>
        <Button component={RouterLink} to="/register" variant="outlined" size="large">Tạo tài khoản</Button>
      </Stack>
    </Box>
  );
}
