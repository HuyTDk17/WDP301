import { Chip } from '@mui/material';
import { STATUS_CONFIG } from '../../constants/status.js';

// <StatusChip type="booking" status={booking.status} />
export default function StatusChip({ type = 'booking', status, size = 'small' }) {
  const config = STATUS_CONFIG[type]?.[status];
  return <Chip size={size} label={config?.label ?? status ?? '—'} color={config?.color ?? 'default'} variant={config ? 'filled' : 'outlined'} />;
}
