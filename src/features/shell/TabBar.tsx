import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from './Icons';

// Plan 1: Home and Activity only. Recurring opens from Activity, Settings from the Home avatar.
const TABS = [
  { to: '/', label: 'Home', icon: 'home', roots: ['/'] },
  { to: '/transactions', label: 'Activity', icon: 'list', roots: ['/transactions', '/recurring'] },
] as const;

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end className={t.roots.some((r) => (r === '/' ? pathname === '/' : pathname.startsWith(r))) ? 'on' : ''}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
