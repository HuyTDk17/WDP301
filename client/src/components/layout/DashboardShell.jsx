import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationBell from './NotificationBell.jsx';
import UserMenu from './UserMenu.jsx';

const DRAWER_WIDTH = 248;

// Khung dùng chung cho Customer / Owner / Admin. Mỗi layout chỉ truyền menu + tiêu đề.
export default function DashboardShell({ title, basePath, menu }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const drawerContent = (
    <Box>
      <Toolbar><Typography variant="h6" color="primary">{title}</Typography></Toolbar>
      <List>
        {menu.map((item) => (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={item.path ? `${basePath}/${item.path}` : basePath}
            end={!item.path}
            onClick={() => setMobileOpen(false)}
            sx={{ '&.active': { bgcolor: 'action.selected', color: 'primary.main' } }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="primary" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1, display: { md: 'none' } }} aria-label="Mở menu">
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Đặt sân thể thao</Typography>
          <NotificationBell to={`${basePath}/notifications`} />
          <UserMenu profilePath={`${basePath}/profile`} />
        </Toolbar>
      </AppBar>

      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
        {drawerContent}
      </Drawer>
      <Drawer variant="permanent" open
        sx={{ display: { xs: 'none', md: 'block' }, width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
        {drawerContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, minWidth: 0 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
