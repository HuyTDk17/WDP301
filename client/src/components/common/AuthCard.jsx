import { Box, Card, CardContent, Typography } from '@mui/material';

export default function AuthCard({ title, subtitle, children }) {
  return (
    <Box sx={{ maxWidth: 440, mx: 'auto', mt: { xs: 2, md: 6 } }}>
      <Card>
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h5" component="h1" gutterBottom>{title}</Typography>
          {subtitle && <Typography color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>}
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}
