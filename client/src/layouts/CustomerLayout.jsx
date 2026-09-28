import DashboardShell from '../components/layout/DashboardShell.jsx';
import { ROLE_MENUS, ROLE_TITLES } from '../constants/roleMenus.jsx';

export default function CustomerLayout() {
  return <DashboardShell title={ROLE_TITLES.customer} basePath="/customer" menu={ROLE_MENUS.customer} />;
}
