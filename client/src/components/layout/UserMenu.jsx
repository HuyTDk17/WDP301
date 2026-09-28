import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Avatar, IconButton, ListItemIcon, Menu, MenuItem, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import useAuth from '../../hooks/useAuth.js';
import { ROLE_LABEL } from '../../constants/roles.js';
import { logout } from '../../store/slices/authSlice.js';
import { clearNotifications } from '../../store/slices/notificationSlice.js';

export default function UserMenu({ profilePath }) {
  const { user, role } = useAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);

  const handleLogout = () => {
    setAnchor(null);
    dispatch(logout());
    dispatch(clearNotifications());
    navigate('/login', { replace: true });
  };

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Menu tài khoản" size="small">
        <Avatar src={user?.avatarUrl} sx={{ width: 32, height: 32 }}>{user?.fullName?.[0]}</Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem disabled>
          <Typography variant="body2">{user?.fullName} · {ROLE_LABEL[role]}</Typography>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); navigate(profilePath); }}>
          <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
          Hồ sơ cá nhân
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          Đăng xuất
        </MenuItem>
      </Menu>
    </>
  );
}
