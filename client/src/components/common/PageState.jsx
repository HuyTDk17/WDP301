import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';

// Bọc nội dung trang: xử lý thống nhất loading / error / empty.
export default function PageState({ loading, error, empty, emptyText = 'Chưa có dữ liệu.', onRetry, children }) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress aria-label="Đang tải" />
      </Box>
    );
  }
  if (error) {
    return (
      <Alert severity="error" action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>Thử lại</Button>}>
        {typeof error === 'string' ? error : error.message}
      </Alert>
    );
  }
  if (empty) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="text.secondary">{emptyText}</Typography>
      </Box>
    );
  }
  return children;
}
