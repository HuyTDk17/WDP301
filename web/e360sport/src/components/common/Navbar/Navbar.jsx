import { useEffect, useState, useRef } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bell, ChevronUp, ChevronDown, User, ClipboardList, Heart, LandPlot, Settings, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/authState'
import { useClickOutside } from '@/hooks'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'
import Avatar from '@/components/ui/Avatar/Avatar'
import Logo from '@/components/common/Logo/Logo'
import styles from './Navbar.module.css'

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { unreadCount } = useUnreadNotifications(isAuthenticated)
  const menuRef = useRef()
  const navigate = useNavigate()

  useClickOutside(menuRef, () => setMenuOpen(false))

  const handleLogout = () => {
    logout()
    navigate('/')
    setMenuOpen(false)
  }

  const NAV_LINKS = [
    { to: '/venues', label: 'Sân thể thao' },
    { to: '/privacy-policy', label: 'Chính sách' },
    { to: '/terms-of-service', label: 'Điều khoản' },
    // Đặt sân/yêu thích là chức năng riêng của khách hàng — chủ sân/admin
    // đăng nhập sẽ không thấy 2 mục này trên thanh điều hướng.
    { to: '/bookings', label: 'Lịch đặt sân', customerOnly: true },
    { to: '/favorites', label: 'Yêu thích', customerOnly: true },
  ]
  const visibleNavLinks = NAV_LINKS.filter(l => !l.customerOnly || (isAuthenticated && user?.role === 'customer'))

  return (
    <header className={styles.navbar}>
      <div className={`container ${styles.inner}`}>
        <Link to="/" className={styles.logo} aria-label="ESport360 — Trang chủ">
          <Logo className={styles.logoImg} />
        </Link>

        <nav className={styles.nav}>
          {visibleNavLinks.map(link => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}>{link.label}</NavLink>
          ))}
        </nav>

        <div className={styles.right}>
          {isAuthenticated ? (
            <>
              <Link to="/notifications" className={styles.iconBtn} title="Thông báo">
                <span><Bell size={17} /></span>
                {unreadCount > 0 && <span className={styles.notifDot}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </Link>
              <div className={styles.userMenu} ref={menuRef}>
                <button className={styles.avatarBtn} onClick={() => setMenuOpen(v => !v)}>
                  <Avatar src={user?.avatar} name={user?.name} size="sm" />
                  <span className={styles.userName}>{user?.name?.split(' ')[0]}</span>
                  <span className={styles.chevron}>{menuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                </button>
                {menuOpen && (
                  <div className={styles.dropdown}>
                    <div className={styles.dropdownHeader}>
                      <Avatar src={user?.avatar} name={user?.name} size="md" />
                      <div>
                        <p className={styles.dropdownName}>{user?.name}</p>
                        <p className={styles.dropdownEmail}>{user?.email}</p>
                      </div>
                    </div>
                    <div className={styles.dropdownDivider} />
                    <Link to="/profile" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}><span><User size={15} /></span> Hồ sơ cá nhân</Link>
                    {user?.role === 'customer' && <Link to="/bookings" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}><span><ClipboardList size={15} /></span> Lịch sử đặt sân</Link>}
                    {user?.role === 'customer' && <Link to="/favorites" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}><span><Heart size={15} /></span> Yêu thích</Link>}
                    {user?.role === 'customer' && (
                      <Link to="/owner-application" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}><span><LandPlot size={15} /></span> Đăng ký làm chủ sân</Link>
                    )}
                    {user?.role === 'owner' && (
                      <>
                        <div className={styles.dropdownDivider} />
                        <Link to="/owner/dashboard" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}><span><LandPlot size={15} /></span> Quản lý sân</Link>
                      </>
                    )}
                    {user?.role === 'admin' && (
                      <>
                        <div className={styles.dropdownDivider} />
                        <Link to="/admin/dashboard" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}><span><Settings size={15} /></span> Trang quản trị</Link>
                      </>
                    )}
                    <div className={styles.dropdownDivider} />
                    <button className={`${styles.dropdownItem} ${styles.logout}`} onClick={handleLogout}><span><LogOut size={15} /></span> Đăng xuất</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.authBtns}>
              <Link to="/login" className={styles.loginBtn}>Đăng nhập</Link>
              <Link to="/register" className={styles.registerBtn}>Đăng ký</Link>
            </div>
          )}
          <button className={styles.hamburger} onClick={() => setMobileOpen(v => !v)} aria-label="Menu"><span /><span /><span /></button>
        </div>
      </div>

      {mobileOpen && (
        <div className={styles.mobileMenu}>
          {visibleNavLinks.map(link => (
            <NavLink key={link.to} to={link.to} className={styles.mobileLink} onClick={() => setMobileOpen(false)}>{link.label}</NavLink>
          ))}
          {!isAuthenticated && (
            <div className={styles.mobileAuth}>
              <Link to="/login" className={styles.mobileLink} onClick={() => setMobileOpen(false)}>Đăng nhập</Link>
              <Link to="/register" className={styles.mobileLink} onClick={() => setMobileOpen(false)}>Đăng ký</Link>
            </div>
          )}
          {isAuthenticated && user?.role === 'customer' && (
            <Link to="/owner-application" className={styles.mobileLink} onClick={() => setMobileOpen(false)}>Đăng ký làm chủ sân</Link>
          )}
        </div>
      )}
    </header>
  )
}
