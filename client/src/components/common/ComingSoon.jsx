import { Card, CardContent, Chip, Stack, Typography } from '@mui/material';

// Trang giữ chỗ cho tính năng sẽ làm ở phase sau. Xoá dần khi từng trang được hiện thực.
export default function ComingSoon({ title, fr }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h5" component="h1">{title}</Typography>
          {fr && <Chip size="small" label={fr} sx={{ alignSelf: 'flex-start' }} />}
          <Typography color="text.secondary">Chức năng này sẽ được hoàn thiện ở giai đoạn tiếp theo.</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
