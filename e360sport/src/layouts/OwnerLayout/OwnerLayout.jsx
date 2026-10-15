import { useState } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import Avatar from '@/components/ui/Avatar/Avatar'
import { LayoutGrid, CalendarRange, Wallet, LandPlot, Trophy, ClipboardList, Users, Settings, Globe, LogOut, PanelLeftClose, PanelLeftOpen, Menu, Bell, Plus, Repeat, Landmark, Percent, Banknote } from 'lucide-react'
import { useAuth } from '@/contexts/authState'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'
import ToastContainer from '@/components/ui/Toast/Toast'
import Logo from '@/components/common/Logo/Logo'
import FeeDuePopup from '@/components/owner/FeeDuePopup/FeeDuePopup'
import styles from './OwnerLayout.module.css'

const NAV_GROUPS = [
  { label: 'Chính', items: [
    { to: '/owner/dashboard', icon: LayoutGrid, label: 'Tổng quan' },
    { to: '/owner/calendar', icon: CalendarRange, label: 'Lịch đặt sân' },
    { to: '/owner/revenue', icon: Wallet, label: 'Doanh thu' },
    { to: '/owner/commission', icon: Percent, label: 'Phí dịch vụ' },
  ]},
  { label: 'Quản lý', items: [
    { to: '/owner/venues', icon: LandPlot, label: 'Địa điểm' },
    { to: '/owner/courts', icon: Trophy, label: 'Sân' },
    { to: '/owner/bookings', icon: ClipboardList, label: 'Lịch đặt' },
    { to: '/owner/payments/pending', icon: Landmark, label: 'Xác nhận chuyển khoản' },
    { to: '/owner/refunds', icon: Banknote, label: 'Hoàn tiền cho khách' },
    { to: '/owner/transfers', icon: Repeat, label: 'Chuyển sân' },
    { to: '/owner/customers', icon: Users, label: 'Khách hàng' },
  ]},
  { label: 'Tài khoản', items: [
    { to: '/owner/settings', icon: Settings, label: 'Cài đặt' },
  ]},
]

export default function OwnerLayout() {
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
          {!collapsed && <div className={styles.ownerInfo}><p className={styles.ownerName}>{user?.name || 'Chủ sân'}</p><p className={styles.ownerRole}>{user?.businessName || 'Chủ sân'}</p></div>}
        </div>
        <nav className={styles.nav}>
          {NAV_GROUPS.map(group => (
            <div key={group.label} className={styles.navGroup}>
              {!collapsed && <p className={styles.groupLabel}>{group.label}</p>}
              {group.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.to === '/owner/dashboard'} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`} title={collapsed ? item.label : ''} onClick={() => setMobileOpen(false)}>
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
              <Link to="/owner/dashboard" className={styles.breadHome}>Chủ sân</Link>
              {pageTitle !== 'Tổng quan' && <><span className={styles.breadSep}>›</span><span className={styles.breadCurrent}>{pageTitle}</span></>}
            </div>
          </div>
          <div className={styles.topbarRight}>
            <Link to="/owner/venues/create" className={styles.addBtn}><Plus size={15} /> Thêm địa điểm</Link>
            <Link to="/owner/notifications" className={styles.notifBtn} title="Thông báo"><Bell size={17} />{unreadCount > 0 && <span className={styles.notifDot}>{unreadCount > 9 ? '9+' : unreadCount}</span>}</Link>
            <Link to="/profile" title="Hồ sơ & ảnh đại diện"><Avatar src={user?.avatar} name={user?.name} size="sm" /></Link>
          </div>
        </header>
        <main className={styles.content}><Outlet /></main>
      </div>
      <FeeDuePopup />
      <ToastContainer />
    </div>
  )
}
