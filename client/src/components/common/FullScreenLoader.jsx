import { Box, CircularProgress } from '@mui/material';

export default function FullScreenLoader() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label="Đang tải" />
    </Box>
  );
}
