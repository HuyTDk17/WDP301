import DashboardShell from '../components/layout/DashboardShell.jsx';
import { ROLE_MENUS, ROLE_TITLES } from '../constants/roleMenus.jsx';

export default function OwnerLayout() {
  return <DashboardShell title={ROLE_TITLES.owner} basePath="/owner" menu={ROLE_MENUS.owner} />;
}
