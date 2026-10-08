import { useState } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import Avatar from '@/components/ui/Avatar/Avatar'
import { LayoutGrid, BarChart3, Users, Building2, LandPlot, CalendarClock, Star, Settings, Globe, LogOut, ShieldCheck, Bell, PanelLeftClose, PanelLeftOpen, Menu, Percent } from 'lucide-react'
import { useAuth } from '@/contexts/authState'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'
import ToastContainer from '@/components/ui/Toast/Toast'
import Logo from '@/components/common/Logo/Logo'
import styles from './AdminLayout.module.css'

const NAV_GROUPS = [
  { label: 'Tổng quan', items: [
    { to: '/admin/dashboard', icon: LayoutGrid, label: 'Tổng quan' },
    { to: '/admin/reports', icon: BarChart3, label: 'Báo cáo' },
  ]},
  { label: 'Quản lý', items: [
    { to: '/admin/users', icon: Users, label: 'Người dùng' },
    { to: '/admin/venues', icon: LandPlot, label: 'Địa điểm' },
    { to: '/admin/owners', icon: Building2, label: 'Chủ sân' },
    { to: '/admin/commissions', icon: CalendarClock, label: 'Hoa hồng theo đơn' },
    { to: '/admin/settlements', icon: Percent, label: 'Đối soát hoa hồng' },
    { to: '/admin/reviews', icon: Star, label: 'Đánh giá' },
  ]},
  { label: 'Hệ thống', items: [
    { to: '/admin/settings', icon: Settings, label: 'Cài đặt' },
  ]},
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { unreadCount } = useUnreadNotifications(true)
  const navigate = useNavigate()
  const location = useLocation()

  const pageTitle = NAV_GROUPS.flatMap(g => g.items).find(i => location.pathname.startsWith(i.to))?.label || 'Tổng quan'
  const handleLogout = () => { logout(); navigate('/') }

  return (
    <div className={`${styles.layout} ${collapsed ? styles.collapsed : ''}`}>
      {mobileOpen && <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)} />}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <Link to="/" className={styles.logo} aria-label="ESport360 — Trang chủ"><Logo variant={collapsed ? 'mark' : 'full'} className={collapsed ? styles.logoMark : styles.logoImg} /></Link>
          <button className={styles.collapseBtn} onClick={() => setCollapsed(v => !v)}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
        </div>
        <div className={styles.ownerCard}>
          <Link to="/profile" title="Hồ sơ & ảnh đại diện"><Avatar src={user?.avatar} name={user?.name} size="md" /></Link>
          {!collapsed && <div className={styles.ownerInfo}><p className={styles.ownerName}>{user?.name || 'Quản trị viên'}</p><p className={styles.ownerRole}><ShieldCheck size={12} />Quản trị viên</p></div>}
        </div>
        <nav className={styles.nav}>
          {NAV_GROUPS.map(group => (
            <div key={group.label} className={styles.navGroup}>
              {!collapsed && <p className={styles.groupLabel}>{group.label}</p>}
              {group.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.to === '/admin/dashboard'} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`} title={collapsed ? item.label : ''} onClick={() => setMobileOpen(false)}>
                  <span className={styles.navIcon}><item.icon size={17} strokeWidth={2} /></span>{!collapsed && <span className={styles.navLabel}>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <Link to="/" className={styles.navItem}><span className={styles.navIcon}><Globe size={17} strokeWidth={2} /></span>{!collapsed && <span className={styles.navLabel}>Xem trang web</span>}</Link>
          <button className={`${styles.navItem} ${styles.logoutItem}`} onClick={handleLogout}><span className={styles.navIcon}><LogOut size={17} strokeWidth={2} /></span>{!collapsed && <span className={styles.navLabel}>Đăng xuất</span>}</button>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.mobileMenuBtn} onClick={() => setMobileOpen(v => !v)}><Menu size={20} /></button>
            <div className={styles.breadcrumb}>
              <Link to="/admin/dashboard" className={styles.breadHome}>Quản trị</Link>
              {pageTitle !== 'Tổng quan' && <><span className={styles.breadSep}>›</span><span className={styles.breadCurrent}>{pageTitle}</span></>}
            </div>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.adminChip}><ShieldCheck size={13} /> Chế độ quản trị</span>
            <Link to="/admin/notifications" className={styles.notifBtn} title="Thông báo"><Bell size={17} />{unreadCount > 0 && <span className={styles.notifDot}>{unreadCount > 9 ? '9+' : unreadCount}</span>}</Link>
            <Link to="/profile" title="Hồ sơ & ảnh đại diện"><Avatar src={user?.avatar} name={user?.name} size="sm" /></Link>
          </div>
        </header>
        <main className={styles.content}><Outlet /></main>
      </div>
      <ToastContainer />
    </div>
  )
}
