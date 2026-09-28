import DashboardShell from '../components/layout/DashboardShell.jsx';
import { ROLE_MENUS, ROLE_TITLES } from '../constants/roleMenus.jsx';

export default function AdminLayout() {
  return <DashboardShell title={ROLE_TITLES.admin} basePath="/admin" menu={ROLE_MENUS.admin} />;
}
