import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Badge, IconButton, Tooltip } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { fetchNotifications, selectUnreadCount } from '../../store/slices/notificationSlice.js';

const POLL_INTERVAL_MS = 60000;

export default function NotificationBell({ to }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const unread = useSelector(selectUnreadCount);

  useEffect(() => {
    dispatch(fetchNotifications());
    const timer = setInterval(() => dispatch(fetchNotifications()), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dispatch]);

  return (
    <Tooltip title="Thông báo">
      <IconButton color="inherit" onClick={() => navigate(to)} aria-label={`Thông báo, ${unread} chưa đọc`}>
        <Badge badgeContent={unread} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
